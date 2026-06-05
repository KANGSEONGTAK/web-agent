// 백그라운드 서비스 워커
chrome.runtime.onInstalled.addListener(() => {
    console.log('AI 지원서 작성 도우미가 설치되었습니다.');
});

// 확장 프로그램 아이콘 클릭 시 사이드 패널 열기
chrome.action.onClicked.addListener((tab) => {
    chrome.sidePanel.open({ tabId: tab.id });
});
