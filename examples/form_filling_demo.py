"""
폼 자동 채우기 데모
간단한 연락처 폼을 자동으로 채우는 예제
"""

from src.agent import WebAgent


def main():
    # 에이전트 시작 (headless=False로 브라우저가 보이게 설정)
    with WebAgent(headless=False) as agent:
        # 테스트 폼 페이지로 이동
        agent.navigate("https://www.w3schools.com/html/html_forms.asp")
        
        # 폼 데이터 준비
        form_data = {
            "fname": "John",
            "lname": "Doe",
            "email": "john.doe@example.com"
        }
        
        # 스마트 폼 채우기
        print("폼을 자동으로 채우는 중...")
        agent.smart_fill_form(form_data)
        
        # 제출 버튼 클릭
        print("제출 버튼 클릭...")
        agent.click_by_text("Submit")


if __name__ == "__main__":
    main()
