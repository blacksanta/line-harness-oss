import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getClient } from "../client.js";

export function registerCreateLpPage(server: McpServer): void {
  server.tool(
    "create_lp_page",
    "視聴期限付きLPを作成（UTAGE風）。LINE友だちのみがLIFF経由で閲覧可能。期限切れは指定URLへ自動リダイレクト。返却値の publicUrl をユーザーに共有してください。重要: YouTube/Vimeo埋め込みは iframe の src を表示することで動画URL自体を知ることができるため、期限後もURLを知っている人は視聴可能です。本格的な保護にはVimeo Proのドメイン制限を併用してください。",
    {
      name: z.string().describe("LP名（管理用）"),
      slug: z
        .string()
        .optional()
        .describe("公開URL用のスラッグ（未指定ならランダム8文字を自動生成、UNIQUE制約あり）"),
      videoUrl: z
        .string()
        .optional()
        .describe("動画URL（任意。YouTube/Vimeoの通常URLでOK。body と合わせていずれか1つは必須。両方指定すると公開ページで動画→本文の順に表示される）"),
      body: z
        .string()
        .optional()
        .describe("Markdown本文（任意。videoUrl と合わせていずれか1つは必須。両方指定すると公開ページで動画→本文の順に表示される）"),
      accessWindowMode: z
        .enum(["absolute", "relative", "both", "none"])
        .describe("期限モード。absolute=絶対日時, relative=友だち登録から N日, both=両方AND, none=無期限"),
      absoluteStartsAt: z
        .string()
        .optional()
        .describe("公開開始日時（JST ISO8601, 例: 2026-06-01T00:00:00+09:00）。absolute/both時に使用"),
      absoluteEndsAt: z
        .string()
        .optional()
        .describe("公開終了日時（JST ISO8601）。absolute/both時に使用"),
      relativeDaysAfterFriendAdd: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("友だち登録日からN日間視聴可。relative/both時に必須"),
      expiredRedirectUrl: z
        .string()
        .url()
        .describe("期限切れ時のリダイレクト先URL（必須）"),
      notFriendRedirectUrl: z
        .string()
        .url()
        .optional()
        .describe("友だちでないユーザーのリダイレクト先（未指定なら expiredRedirectUrl を使用）。友だち追加導線を入れるのが推奨"),
      lineAccountId: z
        .string()
        .optional()
        .describe("どのLINEアカウント配下のLPか。指定するとそのアカウントのLIFF IDが使われる"),
    },
    async (input) => {
      try {
        const hasVideo = typeof input.videoUrl === "string" && input.videoUrl.trim() !== "";
        const hasBody = typeof input.body === "string" && input.body.trim() !== "";
        if (!hasVideo && !hasBody) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({ success: false, error: "videoUrl or body is required" }, null, 2),
              },
            ],
            isError: true,
          };
        }
        const client = getClient();
        const lp = await client.lpPages.create(input);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ success: true, lpPage: lp }, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ success: false, error: String(error) }, null, 2),
            },
          ],
          isError: true,
        };
      }
    },
  );
}
