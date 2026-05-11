import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getClient } from "../client.js";

export function registerManageLpPages(server: McpServer): void {
  server.tool(
    "manage_lp_pages",
    "視聴期限付きLPの管理操作。list: 一覧、get: 詳細、update: 更新、delete: 削除、get_views: 視聴ログ、activate/deactivate: 有効化/無効化。新規作成は create_lp_page を使用。",
    {
      action: z
        .enum(["list", "get", "update", "delete", "get_views", "activate", "deactivate"])
        .describe("実行するアクション"),
      lpPageId: z.string().optional().describe("LP ID（list以外で必須）"),
      name: z.string().optional(),
      slug: z.string().optional(),
      contentType: z.enum(["video", "page"]).optional(),
      videoUrl: z.string().nullable().optional(),
      body: z.string().nullable().optional(),
      accessWindowMode: z.enum(["absolute", "relative", "both", "none"]).optional(),
      absoluteStartsAt: z.string().nullable().optional(),
      absoluteEndsAt: z.string().nullable().optional(),
      relativeDaysAfterFriendAdd: z.number().int().positive().nullable().optional(),
      expiredRedirectUrl: z.string().url().optional(),
      notFriendRedirectUrl: z.string().url().nullable().optional(),
      lineAccountId: z.string().nullable().optional(),
      isActive: z.boolean().optional(),
    },
    async ({
      action,
      lpPageId,
      name,
      slug,
      contentType,
      videoUrl,
      body,
      accessWindowMode,
      absoluteStartsAt,
      absoluteEndsAt,
      relativeDaysAfterFriendAdd,
      expiredRedirectUrl,
      notFriendRedirectUrl,
      lineAccountId,
      isActive,
    }) => {
      try {
        const client = getClient();

        if (action === "list") {
          const lpPages = await client.lpPages.list();
          return { content: [{ type: "text" as const, text: JSON.stringify({ success: true, lpPages }, null, 2) }] };
        }

        if (!lpPageId) throw new Error("lpPageId is required for this action");

        if (action === "get") {
          const lp = await client.lpPages.get(lpPageId);
          return { content: [{ type: "text" as const, text: JSON.stringify({ success: true, lpPage: lp }, null, 2) }] };
        }

        if (action === "get_views") {
          const views = await client.lpPages.getViews(lpPageId);
          return { content: [{ type: "text" as const, text: JSON.stringify({ success: true, views }, null, 2) }] };
        }

        if (action === "delete") {
          await client.lpPages.delete(lpPageId);
          return { content: [{ type: "text" as const, text: JSON.stringify({ success: true, deleted: lpPageId }, null, 2) }] };
        }

        if (action === "activate" || action === "deactivate") {
          const lp = await client.lpPages.update(lpPageId, { isActive: action === "activate" });
          return { content: [{ type: "text" as const, text: JSON.stringify({ success: true, lpPage: lp }, null, 2) }] };
        }

        if (action === "update") {
          const updates: Record<string, unknown> = {};
          if (name !== undefined) updates.name = name;
          if (slug !== undefined) updates.slug = slug;
          if (contentType !== undefined) updates.contentType = contentType;
          if (videoUrl !== undefined) updates.videoUrl = videoUrl;
          if (body !== undefined) updates.body = body;
          if (accessWindowMode !== undefined) updates.accessWindowMode = accessWindowMode;
          if (absoluteStartsAt !== undefined) updates.absoluteStartsAt = absoluteStartsAt;
          if (absoluteEndsAt !== undefined) updates.absoluteEndsAt = absoluteEndsAt;
          if (relativeDaysAfterFriendAdd !== undefined) updates.relativeDaysAfterFriendAdd = relativeDaysAfterFriendAdd;
          if (expiredRedirectUrl !== undefined) updates.expiredRedirectUrl = expiredRedirectUrl;
          if (notFriendRedirectUrl !== undefined) updates.notFriendRedirectUrl = notFriendRedirectUrl;
          if (lineAccountId !== undefined) updates.lineAccountId = lineAccountId;
          if (isActive !== undefined) updates.isActive = isActive;
          const lp = await client.lpPages.update(lpPageId, updates);
          return { content: [{ type: "text" as const, text: JSON.stringify({ success: true, lpPage: lp }, null, 2) }] };
        }

        throw new Error(`Unknown action: ${action}`);
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ success: false, error: String(err) }) }],
          isError: true,
        };
      }
    },
  );
}
