import type { CommandResult } from "./command";

export type AdItem = {
  id?: string;
  type: "sponsor" | "normal" | string;
  title: string;
  description: string;
  url: string;
  image?: string;
  highlights?: string[];
  expires_at?: string;
};

export type AdsResult = CommandResult<{
  version: number;
  ads: AdItem[];
}>;
