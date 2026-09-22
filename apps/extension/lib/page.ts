import type { PageContext } from '@spool/ui';

const SKIP = /^(chrome|edge|brave|about|moz-extension|chrome-extension|view-source|file):/;

/**
 * The page the user opened Spool from. Only available for the tab where the
 * toolbar button or shortcut was used (activeTab), which is exactly the page
 * they meant to share. No broad host permissions needed.
 */
export async function currentPage(): Promise<PageContext | null> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url || !tab.id || SKIP.test(tab.url)) return null;
  let selection = '';
  try {
    const [result] = await browser.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => window.getSelection()?.toString() ?? '',
    });
    selection = typeof result?.result === 'string' ? result.result.slice(0, 1000) : '';
  } catch {
    // Some pages (stores, PDFs) refuse script injection. The URL is still useful.
  }
  return { url: tab.url, title: tab.title ?? '', selection };
}
