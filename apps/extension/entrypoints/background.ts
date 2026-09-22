export default defineBackground(() => {
  // Chrome: the toolbar button and its shortcut (Alt+Shift+S) open the side
  // panel directly. Firefox opens its sidebar via _execute_sidebar_action.
  const chromeLike = (globalThis as { chrome?: { sidePanel?: { setPanelBehavior: (o: object) => Promise<void> } } })
    .chrome;
  chromeLike?.sidePanel?.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);

  if (import.meta.env.FIREFOX) {
    browser.action.onClicked.addListener(() => {
      (browser as unknown as { sidebarAction: { toggle: () => Promise<void> } }).sidebarAction.toggle();
    });
  }
});
