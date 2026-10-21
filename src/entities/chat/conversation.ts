import { useMemo } from "react";
import {
  getCouple,
  getItem,
  getItems,
  myId,
  onSignal,
  putItem,
  removeItem,
  signal,
  useCouple,
  useItem,
  useItems,
  type CoupleItem,
  type MessageData,
} from "@/entities/couple";
import { supabase } from "@/shared/api/supabase";
import { sealMessage } from "@/entities/e2e";
import { createId } from "@/shared/lib/id";
import {
  chatSignal,
  getChatItem,
  getChatItems,
  onChatSignal,
  putChatItem,
  removeChatItem,
  useChatItem,
  useChatItems,
  useContacts,
  type Contact,
} from "./contacts";

/**
 * One chat, whoever it is with: the partner (the couple's shared space) or a friend / family member.
 * The chat screen, calls and forwarding work through this, so every chat has the same Telegram-like abilities.
 */
export type Conversation = {
  /** "partner", or the other person's id. */
  id: string;
  /** Where its items and files live (couple key or chat key). */
  key: string;
  isPartner: boolean;
  peer: { id: string; name: string; online: boolean };
  useItems: <T>(kind: string) => Array<CoupleItem<T>>;
  useItem: <T>(id: string) => CoupleItem<T> | null;
  getItems: <T>(kind: string) => Array<CoupleItem<T>>;
  getItem: <T>(id: string) => CoupleItem<T> | null;
  put: (id: string, kind: string, data: Record<string, unknown>) => Promise<void>;
  remove: (id: string) => Promise<void>;
  signal: (event: string, payload?: Record<string, unknown>) => Promise<boolean>;
  onSignal: (event: string, handler: (payload: Record<string, unknown>) => void) => () => void;
};

export const PARTNER = "partner";

export function partnerConversation(): Conversation | null {
  const couple = getCouple();
  if (!couple.partner || !couple.me?.couple_key) return null;
  return {
    id: PARTNER,
    key: couple.me.couple_key,
    isPartner: true,
    peer: { id: couple.partner.id, name: couple.partner.name || "♥", online: couple.presence.online },
    useItems,
    useItem,
    getItems,
    getItem,
    put: async (id, kind, data) => putItem(id, kind, kind === "msg" ? await sealMessage(couple.partner!.id, data) : data),
    remove: removeItem,
    signal,
    onSignal: (event, handler) => {
      const off = onSignal(event, handler);
      return () => void off();
    },
  };
}

export function contactConversation(contact: Contact): Conversation {
  const key = contact.chatKey;
  return {
    id: contact.id,
    key,
    isPartner: false,
    peer: { id: contact.id, name: contact.name, online: contact.online },
    useItems: <T>(kind: string) => useChatItems<T>(key, kind),
    useItem: <T>(id: string) => useChatItem<T>(key, id),
    getItems: <T>(kind: string) => getChatItems<T>(key, kind),
    getItem: <T>(id: string) => getChatItem<T>(key, id),
    put: async (id, kind, data) => putChatItem(key, id, kind, kind === "msg" ? await sealMessage(contact.id, data) : data),
    remove: (id) => removeChatItem(key, id),
    signal: (event, payload) => chatSignal(key, event, payload),
    onSignal: (event, handler) => {
      const off = onChatSignal(event, (chatKey, payload) => chatKey === key && handler(payload));
      return () => void off();
    },
  };
}

/** Every chat this person has: the partner first, then family, then friends. */
export function allConversations(contacts: Contact[]): Conversation[] {
  const partner = partnerConversation();
  const order = (contact: Contact) => (contact.kind === "family" ? 0 : 1);
  return [...(partner ? [partner] : []), ...[...contacts].sort((a, b) => order(a) - order(b) || a.name.localeCompare(b.name)).map(contactConversation)];
}

/** A conversation by id ("partner" or a person), kept stable while nothing about it changes. */
export function useConversation(id: string): Conversation | null {
  const couple = useCouple();
  const contacts = useContacts();
  const contact = id === PARTNER ? undefined : contacts.list.find((item) => item.id === id);
  const partnerKey = couple.me?.couple_key;
  return useMemo(
    () => (id === PARTNER ? partnerConversation() : contact ? contactConversation(contact) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [id, partnerKey, couple.partner?.id, couple.partner?.name, couple.presence.online, contact?.chatKey, contact?.name, contact?.online],
  );
}

export function conversationFor(id: string, contacts: Contact[]): Conversation | null {
  if (id === PARTNER) return partnerConversation();
  const contact = contacts.find((item) => item.id === id);
  return contact ? contactConversation(contact) : null;
}

/* ------------------------------------------------------------------ messages */

export function messageOrder(a: CoupleItem<MessageData>, b: CoupleItem<MessageData>) {
  return a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id);
}

type Extra = Partial<Pick<MessageData, "sticker" | "replyTo" | "voice" | "photo" | "call" | "video" | "topic" | "forwarded">>;

export async function send(conv: Conversation, text: string | null, extra: Extra = {}) {
  const body = text?.trim() || null;
  if (!body && !extra.sticker && !extra.voice && !extra.photo && !extra.call && !extra.video) return;
  const id = `msg:${createId()}`;
  await conv.put(id, "msg", {
    text: body,
    sticker: extra.sticker ?? null,
    reactions: {},
    replyTo: extra.replyTo ?? null,
    voice: extra.voice ?? null,
    photo: extra.photo ?? null,
    ...(extra.video ? { video: extra.video } : {}),
    ...(extra.topic ? { topic: extra.topic } : {}),
    ...(extra.forwarded ? { forwarded: extra.forwarded } : {}),
    ...(extra.call ? { call: extra.call } : {}),
  } satisfies MessageData);
  void conv.signal("typing", { typing: false });
}

export async function edit(conv: Conversation, id: string, text: string) {
  const item = conv.getItem<MessageData>(id);
  if (!item || !text.trim() || item.author !== myId()) return;
  await conv.put(id, "msg", { ...item.data, text: text.trim(), edited: new Date().toISOString() });
}

export async function pin(conv: Conversation, id: string) {
  const item = conv.getItem<MessageData>(id);
  if (!item) return;
  await conv.put(id, "msg", { ...item.data, pinned: item.data.pinned ? null : new Date().toISOString() });
}

export async function react(conv: Conversation, id: string, emoji: string) {
  const me = myId();
  const item = conv.getItem<MessageData>(id);
  if (!me || !item) return;
  const reactions = { ...(item.data.reactions ?? {}) };
  if (reactions[me] === emoji) delete reactions[me];
  else reactions[me] = emoji;
  await conv.put(id, "msg", { ...item.data, reactions });
}

export async function removeMessage(conv: Conversation, id: string) {
  await conv.remove(id);
}

export async function read(conv: Conversation, seenAt: string) {
  const me = myId();
  if (!me) return;
  const current = conv.getItem<{ seen?: string }>(`read:${me}`);
  if (current?.data.seen && current.data.seen >= seenAt) return;
  await conv.put(`read:${me}`, "read", { seen: seenAt, at: new Date().toISOString() });
}

/** How many of the other person's messages this person hasn't read. */
export function unreadIn(conv: Conversation): number {
  const me = myId();
  if (!me) return 0;
  const seen = conv.getItem<{ seen?: string }>(`read:${me}`)?.data.seen ?? "";
  return conv.getItems<MessageData>("msg").filter((message) => message.author !== me && message.created_at > seen).length;
}

/** Files live in each chat's own folder, so a forwarded photo or video is copied into the other chat's folder. */
async function copyFile(path: string, toKey: string): Promise<string> {
  const target = `${toKey}/${path.split("/").slice(1).join("/")}`;
  if (target === path) return path;
  const { error } = await supabase.storage.from("couple").copy(path, target);
  if (error && !/exists/i.test(error.message)) throw error;
  return target;
}

/** Forwards messages (text, photos, videos, voice, stickers) into another chat, like Telegram. */
export async function forward(from: Conversation, ids: string[], to: Conversation, fromName: string) {
  const messages = ids
    .map((id) => from.getItem<MessageData>(id))
    .filter((item): item is CoupleItem<MessageData> => Boolean(item))
    .sort(messageOrder);
  for (const message of messages) {
    const data = message.data;
    const author = message.author === myId() ? null : fromName;
    await send(to, data.text, {
      sticker: data.sticker,
      photo: data.photo ? { ...data.photo, path: await copyFile(data.photo.path, to.key) } : null,
      video: data.video ? { ...data.video, path: await copyFile(data.video.path, to.key) } : null,
      voice: data.voice ? { ...data.voice, path: await copyFile(data.voice.path, to.key) } : null,
      topic: data.topic ?? null,
      forwarded: { name: data.forwarded?.name ?? author ?? null },
    });
  }
}
