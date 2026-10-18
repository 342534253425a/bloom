/**
 * Bloom – скрипт создания тестового пользователя
 *
 * Вставьте весь этот код в консоль DevTools, пока открыто приложение.
 * Тестовые данные:
 *   Email:    test@bloom.test
 *   Пароль:   Bloom2024!
 */

(async () => {
  // ─── Вспомогательные функции (те же, что в src/shared/lib/crypto) ───
  const ITERATIONS = 120_000;

  function bytesToBase64(bytes) {
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
  }

  async function hashPassword(password) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(password),
      "PBKDF2",
      false,
      ["deriveBits"],
    );
    const bits = await crypto.subtle.deriveBits(
      { name: "PBKDF2", hash: "SHA-256", salt, iterations: ITERATIONS },
      key,
      256,
    );
    return { hash: bytesToBase64(new Uint8Array(bits)), salt: bytesToBase64(salt) };
  }

  function nanoid(size = 21) {
    const chars = "useandom-26T198340PX75pxJACKVERYMINDBUSHWOLF_GQZbfghjklqvwyzrict";
    const bytes = crypto.getRandomValues(new Uint8Array(size));
    return Array.from(bytes, (b) => chars[b & 63]).join("");
  }

  // ─── Данные тестового пользователя ───────────────────────────────────
  const EMAIL    = "test@bloom.test";
  const PASSWORD = "Bloom2024!";
  const NAME     = "Тест Пользователь";

  // ─── Открыть IndexedDB "bloom" ────────────────────────────────────────
  const dbReq = indexedDB.open("bloom");
  const idb = await new Promise((res, rej) => {
    dbReq.onsuccess = () => res(dbReq.result);
    dbReq.onerror  = () => rej(dbReq.error);
  });

  // Проверить, не существует ли пользователь
  const existing = await new Promise((res, rej) => {
    const tx  = idb.transaction("users", "readonly");
    const idx = tx.objectStore("users").index("email");
    const req = idx.get(EMAIL);
    req.onsuccess = () => res(req.result);
    req.onerror   = () => rej(req.error);
  });

  if (existing) {
    console.warn("⚠️  Пользователь с таким email уже существует:", existing.id);
    idb.close();
    return;
  }

  // Хешировать пароль
  const { hash, salt } = await hashPassword(PASSWORD);
  const userId    = nanoid();
  const createdAt = new Date().toISOString();

  // Записать пользователя
  await new Promise((res, rej) => {
    const tx   = idb.transaction("users", "readwrite");
    const req  = tx.objectStore("users").add({
      id:           userId,
      email:        EMAIL,
      displayName:  NAME,
      passwordHash: hash,
      passwordSalt: salt,
      createdAt,
    });
    req.onsuccess = () => res();
    req.onerror   = () => rej(req.error);
    tx.oncomplete = () => res();
  });

  idb.close();

  console.log("✅  Тестовый пользователь создан!");
  console.log("   Email:  ", EMAIL);
  console.log("   Пароль: ", PASSWORD);
})();
