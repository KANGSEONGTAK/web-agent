from src.agent import WebAgent
from src.resume_writer import ResumeWriter
from src.portfolio import PortfolioManager
from typing import Dict, Any, List


class ApplicationAgent:
    def __init__(self, headless: bool = False):
        self.browser_agent = WebAgent(headless=headless)
        self.resume_writer = ResumeWriter()
        self.portfolio = PortfolioManager()
    
    def auto_fill_application(self, job_url: str, job_posting_text: str = ""):
        """지원서 자동 작성"""
        print("=== 지원서 자동 작성 시작 ===")
        
        # 1. 채용 공고 분석
        if job_posting_text:
            print("\n[1/4] 채용 공고 분석 중...")
            analysis = self.resume_writer.analyze_job_posting(job_posting_text)
            print(f"직무: {analysis.get('position', 'N/A')}")
        
        # 2. 합격률 팁 생성
        if job_posting_text:
            print("\n[2/4] 합격률 향상 판단 중...")
            tips = self.resume_writer.generate_success_tips(job_posting_text)
            print(f"강점: {len(tips.get('strengths', []))}개")
            print(f"개선점: {len(tips.get('improvement_suggestions', []))}개")
        
        # 3. 브라우저에서 지원서 작성
        print(f"\n[3/4] {job_url}로 이동...")
        with self.browser_agent as agent:
            agent.navigate(job_url)
            
            # 페이지 분석
            elements = agent.browser.get_interactive_elements()
            print(f"발견된 요소: {len(elements)}개")
            
            # 기본 정보 자동 채우기
            portfolio_data = self.portfolio.get_data()
            print("\n[4/4] 기본 정보 자동 채우기...")
            
            # 이름
            if portfolio_data.get('name'):
                try:
                    name_inputs = [el for el in elements if 'name' in el.get('name', '').lower() or '이름' in el.get('placeholder', '').lower()]
                    if name_inputs:
                        selector = f"#{name_inputs[0]['id']}" if name_inputs[0].get('id') else f"input[name='{name_inputs[0]['name']}']"
                        agent.browser.fill_input(selector, portfolio_data['name'])
                        print(f"이름 채움: {portfolio_data['name']}")
                except:
                    pass
            
            # 이메일
            if portfolio_data.get('email'):
                try:
                    email_inputs = [el for el in elements if 'email' in el.get('name', '').lower() or '이메일' in el.get('placeholder', '').lower()]
                    if email_inputs:
                        selector = f"#{email_inputs[0]['id']}" if email_inputs[0].get('id') else f"input[name='{email_inputs[0]['name']}']"
                        agent.browser.fill_input(selector, portfolio_data['email'])
                        print(f"이메일 채움: {portfolio_data['email']}")
                except:
                    pass
            
            # 전화번호
            if portfolio_data.get('phone'):
                try:
                    phone_inputs = [el for el in elements if 'phone' in el.get('name', '').lower() or '전화' in el.get('placeholder', '').lower() or 'tel' in el.get('name', '').lower()]
                    if phone_inputs:
                        selector = f"#{phone_inputs[0]['id']}" if phone_inputs[0].get('id') else f"input[name='{phone_inputs[0]['name']}']"
                        agent.browser.fill_input(selector, portfolio_data['phone'])
                        print(f"전화번호 채움: {portfolio_data['phone']}")
                except:
                    pass
            
            print("\n기본 정보 채우기 완료!")
            print("자기소개서는 수동으로 작성하거나, generate_self_introduction()을 사용하세요.")
            
            import time
            time.sleep(5)
    
    def get_application_guide(self, job_posting_text: str) -> Dict[str, Any]:
        """지원서 작성 가이드 생성"""
        print("=== 지원서 작성 가이드 ===")
        
        analysis = self.resume_writer.analyze_job_posting(job_posting_text)
        tips = self.resume_writer.generate_success_tips(job_posting_text)
        
        return {
            "job_analysis": analysis,
            "success_tips": tips,
            "portfolio": self.portfolio.get_data()
        }
