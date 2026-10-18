import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { setActivity, useCouple } from "@/entities/couple";
import { PageHead, Tabs } from "@/shared/ui/bloom";
import { ChinesePhrasebook } from "./chinese";
import { IeltsHub } from "./ielts";

type Tab = "cn" | "ielts";
const tabKey = "bloom.learn.tab";

export function LearnPage() {
  const { t } = useTranslation();
  const couple = useCouple();
  const [tab, setTabState] = useState<Tab>(() => {
    try {
      return (localStorage.getItem(tabKey) as Tab) || "ielts";
    } catch {
      return "ielts";
    }
  });

  useEffect(() => {
    setActivity("learn");
  }, []);

  function setTab(next: Tab) {
    setTabState(next);
    try {
      localStorage.setItem(tabKey, next);
    } catch {
      /* storage may be unavailable */
    }
  }

  return (
    <div className="page">
      <PageHead title={t("learn.title")} sub={t("learn.sub")} art="c-read" back />
      <Tabs
        value={tab}
        onChange={setTab}
        options={[
          { id: "ielts", label: t("learn.tabIelts") },
          { id: "cn", label: t("learn.tabCn") },
        ]}
      />
      {tab === "cn" && !couple.partner ? <p className="card sub">{t("learn.needPartner")}</p> : null}
      {tab === "cn" ? <ChinesePhrasebook /> : <IeltsHub />}
    </div>
  );
}
