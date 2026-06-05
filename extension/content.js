// 페이지의 폼 요소에 자동으로 데이터 채우기
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'autofill') {
        autofillForm(request.data);
        sendResponse({ status: 'success' });
    }
});

function autofillForm(data) {
    // 이름 채우기
    if (data.name) {
        fillField('name', data.name);
        fillField('성명', data.name);
        fillField('이름', data.name);
    }
    
    // 이메일 채우기
    if (data.email) {
        fillField('email', data.email);
        fillField('이메일', data.email);
        fillField('Email', data.email);
    }
    
    // 전화번호 채우기
    if (data.phone) {
        fillField('phone', data.phone);
        fillField('전화', data.phone);
        fillField('연락처', data.phone);
        fillField('tel', data.phone);
    }
    
    // 나이 채우기
    if (data.age) {
        fillField('age', data.age);
        fillField('나이', data.age);
    }
}

function fillField(keyword, value) {
    // input 태그 찾기
    const inputs = document.querySelectorAll('input');
    inputs.forEach(input => {
        const name = input.name ? input.name.toLowerCase() : '';
        const placeholder = input.placeholder ? input.placeholder.toLowerCase() : '';
        const id = input.id ? input.id.toLowerCase() : '';
        
        if (name.includes(keyword.toLowerCase()) || 
            placeholder.includes(keyword.toLowerCase()) ||
            id.includes(keyword.toLowerCase())) {
            input.value = value;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
        }
    });
    
    // textarea 찾기
    const textareas = document.querySelectorAll('textarea');
    textareas.forEach(textarea => {
        const name = textarea.name ? textarea.name.toLowerCase() : '';
        const placeholder = textarea.placeholder ? textarea.placeholder.toLowerCase() : '';
        const id = textarea.id ? textarea.id.toLowerCase() : '';
        
        if (name.includes(keyword.toLowerCase()) || 
            placeholder.includes(keyword.toLowerCase()) ||
            id.includes(keyword.toLowerCase())) {
            textarea.value = value;
            textarea.dispatchEvent(new Event('input', { bubbles: true }));
            textarea.dispatchEvent(new Event('change', { bubbles: true }));
        }
    });
}
