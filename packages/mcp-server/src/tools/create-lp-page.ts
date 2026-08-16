import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getClient } from "../client.js";

const lpBlockSchema = z.discriminatedUnion("type", [
  z.object({
    id: z.string().optional(),
    type: z.literal("video"),
    url: z.string().url(),
    caption: z.string().optional(),
  }),
  z.object({
    id: z.string().optional(),
    type: z.literal("markdown"),
    text: z.string(),
  }),
  z.object({
    id: z.string().optional(),
    type: z.literal("image"),
    url: z.string().url(),
    alt: z.string().optional(),
    href: z.string().url().optional(),
  }),
  z.object({
    id: z.string().optional(),
    type: z.literal("button"),
    label: z.string(),
    href: z.string().url(),
    style: z.enum(["primary", "secondary"]).optional(),
  }),
  z.object({
    id: z.string().optional(),
    type: z.literal("divider"),
  }),
]);

export function registerCreateLpPage(server: McpServer): void {
  server.tool(
    "create_lp_page",
    "視聴期限付きLPを作成（UTAGE風）。LINE友だちのみがLIFF経由で閲覧可能。期限切れは指定URLへ自動リダイレクト。返却値の publicUrl をユーザーに共有してください。コンテンツは blocks 配列で video / markdown / image / button / divider を任意順に並べられる。後方互換として videoUrl + body の指定にも対応（その場合は内部で blocks に変換され、動画→本文の順に表示）。重要: YouTube/Vimeo埋め込みは iframe の src を表示することで動画URL自体を知ることができるため、期限後もURLを知っている人は視聴可能です。本格的な保護にはVimeo Proのドメイン制限を併用してください。",
    {
      name: z.string().describe("LP名（管理用）"),
      slug: z
        .string()
        .optional()
        .describe("公開URL用のスラッグ（未指定ならランダム8文字を自動生成、UNIQUE制約あり）"),
      blocks: z
        .array(lpBlockSchema)
        .optional()
        .describe(
          "コンテンツブロックの配列（任意順）。各要素は { type: 'video'|'markdown'|'image'|'button'|'divider', ...type固有フィールド }。指定時は videoUrl / body は自動導出される。未指定の場合は videoUrl / body から自動構成（後方互換）",
        ),
      videoUrl: z
        .string()
        .optional()
        .describe("動画URL（任意・後方互換。YouTube/Vimeoの通常URLでOK。blocks と併用しない場合 body と合わせていずれか1つは必須）"),
      body: z
        .string()
        .optional()
        .describe("Markdown本文（任意・後方互換。blocks と併用しない場合 videoUrl と合わせていずれか1つは必須）"),
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
        const hasBlocks = Array.isArray(input.blocks) && input.blocks.length > 0;
        const hasVideo = typeof input.videoUrl === "string" && input.videoUrl.trim() !== "";
        const hasBody = typeof input.body === "string" && input.body.trim() !== "";
        if (!hasBlocks && !hasVideo && !hasBody) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  { success: false, error: "blocks (or videoUrl/body) is required" },
                  null,
                  2,
                ),
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
