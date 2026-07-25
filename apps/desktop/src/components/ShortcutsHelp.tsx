import { X } from "lucide-react";

/** 快捷键帮助面板 · ⇧⌘/ 或 F1 触发 */
export function ShortcutsHelp({ onClose }: { onClose: () => void }) {
  const groups: Array<{ title: string; items: Array<[string, string]> }> = [
    {
      title: "导航",
      items: [
        ["⌘K", "打开命令面板"],
        ["⌘G", "跳转到图库"],
        ["⌘⇧O", "打开配置目录"],
        ["⇧⌘/  ·  F1", "打开这个帮助"],
      ],
    },
    {
      title: "生图页",
      items: [
        ["⌘Enter", "触发批量生成"],
        ["拖拽把手", "重排任务顺序"],
        ["Hover 结果图", "复制到剪贴板 / 下载"],
      ],
    },
    {
      title: "图库",
      items: [
        ["← / →", "预览上一张 / 下一张"],
        ["Esc", "关闭预览"],
      ],
    },
  ];

  return (
    <div
      className="fixed inset-0 z-[70] grid place-items-center bg-black/50 backdrop-blur-sm px-6"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg)] shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-3">
          <h2 className="text-sm font-semibold">快捷键</h2>
          <button
            onClick={onClose}
            className="grid size-7 place-items-center rounded text-[var(--color-text-subtle)] hover:bg-[var(--color-panel)] hover:text-[var(--color-text)]"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="flex flex-col gap-5 px-5 py-4">
          {groups.map((group) => (
            <section key={group.title} className="flex flex-col gap-2">
              <div className="text-[10px] font-medium uppercase tracking-wider text-[var(--color-text-subtle)]">
                {group.title}
              </div>
              <div className="flex flex-col gap-1.5">
                {group.items.map(([keys, desc]) => (
                  <div
                    key={keys}
                    className="flex items-center justify-between rounded-[var(--radius)] px-2 py-1.5 text-sm hover:bg-[var(--color-panel)]"
                  >
                    <span className="text-[var(--color-text-muted)]">{desc}</span>
                    <kbd className="rounded border border-[var(--color-border)] bg-[var(--color-panel)] px-1.5 py-0.5 text-[11px] tabular-nums text-[var(--color-text-muted)]">
                      {keys}
                    </kbd>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
