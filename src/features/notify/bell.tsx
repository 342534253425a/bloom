import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useInbox } from "@/entities/notify";
import { useUser } from "@/entities/session";
import { Glyph } from "@/shared/ui/glyph";

/** Bell that opens the notification centre, with the unread count. */
export function BellButton() {
  const { t } = useTranslation();
  const user = useUser();
  const unread = useInbox(user.id).filter((item) => !item.read).length;
  return (
    <Link to="/notifications" className="round-btn bell-btn" aria-label={t("notify.title")}>
      <Glyph name="bell" size={21} stroke={2.1} />
      {unread ? <span className="unread-badge is-small">{unread > 9 ? "9+" : unread}</span> : null}
    </Link>
  );
}
