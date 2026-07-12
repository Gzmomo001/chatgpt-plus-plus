import { ExternalLink, RefreshCw } from "lucide-react";

import { Button } from "@/shared/ui/button";
import { CardContent } from "@/shared/ui/card";
import { t, tf } from "@/i18n";
import type { AdItem, AdsResult } from "@/shared/contracts/recommendations";
import { CardHead, Panel } from "@/shared/ui/layout";

import { projectRecommendations } from "./presentation";

export type RecommendationsActions = {
  refreshAds: () => Promise<void>;
  openExternalUrl: (url: string) => Promise<void>;
};

export function RecommendationsScreen({
  ads,
  actions,
  now = Date.now(),
}: {
  ads: AdsResult | null;
  actions: RecommendationsActions;
  now?: number;
}) {
  const { items, sponsors, normal } = projectRecommendations(ads?.ads ?? [], now);
  return (
    <>
      <Panel>
        <CardHead title={t("推荐内容")} detail={t("与 Codex 内插件菜单使用同一个远端广告源")} />
        <CardContent>
          <div className="recommend-hero">
            <div>
              <strong>{ads ? tf("已加载 {0} 条推荐", [items.length]) : t("尚未加载推荐内容")}</strong>
              <span>{t("内容来自 BigPizzaV3/Ad-List，分为赞助商推荐和普通推荐。")}</span>
            </div>
            <Button onClick={() => void actions.refreshAds()}>
              <RefreshCw className="h-4 w-4" />
              {t("刷新推荐")}
            </Button>
          </div>
        </CardContent>
      </Panel>
      <Panel>
        <CardHead title={t("赞助商推荐")} detail={tf("{0} 条", [sponsors.length])} />
        <CardContent>
          <AdGrid actions={actions} ads={sponsors} empty={t("暂无赞助商推荐。")} />
        </CardContent>
      </Panel>
      <Panel>
        <CardHead title={t("普通推荐")} detail={tf("{0} 条", [normal.length])} />
        <CardContent>
          <AdGrid actions={actions} ads={normal} empty={t("暂无普通推荐。")} />
        </CardContent>
      </Panel>
    </>
  );
}

function AdGrid({
  ads,
  empty,
  actions,
}: {
  ads: AdItem[];
  empty: string;
  actions: Pick<RecommendationsActions, "openExternalUrl">;
}) {
  if (!ads.length) return <div className="empty">{empty}</div>;
  return (
    <div className="ad-grid">
      {ads.map((ad) => (
        <button
          className="ad-card"
          key={ad.id || `${ad.type}-${ad.title}`}
          onClick={() => void actions.openExternalUrl(ad.url)}
          type="button"
        >
          {ad.image ? <img alt="" className="ad-image" src={ad.image} /> : null}
          <div>
            <strong>{ad.title}</strong>
            <p>{ad.description}</p>
          </div>
          {ad.highlights?.length ? (
            <div className="ad-tags">
              {ad.highlights.map((item) => (
                <span key={item}>{item}</span>
              ))}
            </div>
          ) : null}
          <span className="ad-link">
            {t("打开")}
            <ExternalLink className="h-4 w-4" />
          </span>
        </button>
      ))}
    </div>
  );
}
