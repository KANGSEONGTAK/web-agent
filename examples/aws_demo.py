"""
AWS 인스턴스 생성 자동화 데모
AWS 콘솔에서 EC2 인스턴스를 생성하는 예제
"""

from src.agent import WebAgent


def main():
    with WebAgent(headless=False) as agent:
        # AWS 콘솔 로그인 페이지로 이동
        agent.navigate("https://console.aws.amazon.com/")
        
        # 자율적으로 인스턴스 생성 목표 달성
        # 참고: 실제 사용 시 AWS 자격증명이 필요합니다
        agent.autonomous_execute(
            goal="Create a new t2.micro EC2 instance in us-east-1 with default settings",
            max_steps=15
        )


if __name__ == "__main__":
    main()
