from src.llm import LLMClient
from src.portfolio import PortfolioManager
from typing import Dict, Any
import json


class ResumeWriter:
    def __init__(self):
        self.llm = LLMClient()
        self.portfolio = PortfolioManager()
    
    def analyze_job_posting(self, job_posting_text: str) -> Dict[str, Any]:
        """채용 공고 분석"""
        system_prompt = "채용 공고를 분석해서 다음 정보를 JSON으로 추출하세요: company_name, position, requirements[], preferred_qualifications[], job_description, key_skills[]"
        
        user_prompt = f"채용 공고:\n{job_posting_text[:3000]}"
        
        response = self.llm._call_llm(system_prompt, user_prompt, use_json=True)
        return json.loads(response)
    
    def generate_self_introduction(self, job_posting_text: str, question: str = "") -> str:
        """맞춤형 자기소개서 작성"""
        portfolio_data = self.portfolio.get_data()
        
        system_prompt = "채용 공고와 지원자의 포트폴리오를 분석해서 합격률을 높이는 맞춤형 자기소개서를 작성하세요. 공고에서 요구하는 역량과 지원자의 경험을 연결해서 작성해주세요."
        
        user_prompt = f"""
채용 공고:
{job_posting_text[:2000]}

질문: {question if question else '본인을 소개해주세요'}

지원자 포트폴리오:
{json.dumps(portfolio_data, ensure_ascii=False, indent=2)}

자기소개서를 작성해주세요. 공고에서 요구하는 역량을 강조하고, 지원자의 실제 경험과 연결해주세요.
"""
        
        response = self.llm._call_llm(system_prompt, user_prompt, use_json=False)
        return response
    
    def generate_success_tips(self, job_posting_text: str) -> Dict[str, Any]:
        """합격률 향상 팁 생성"""
        portfolio_data = self.portfolio.get_data()
        
        system_prompt = "채용 공고와 지원자의 포트폴리오를 분석해서 합격률을 높이는 팁을 JSON으로 제공하세요. 다음 필드를 포함: strengths[], weaknesses[], improvement_suggestions[], key_points_to_emphasize[]"
        
        user_prompt = f"""
채용 공고:
{job_posting_text[:2000]}

지원자 포트폴리오:
{json.dumps(portfolio_data, ensure_ascii=False, indent=2)}

합격률을 높이기 위한 팁을 제공해주세요.
"""
        
        response = self.llm._call_llm(system_prompt, user_prompt, use_json=True)
        return json.loads(response)
    
    def generate_full_application(self, job_posting_text: str, questions: list) -> Dict[str, str]:
        """전체 지원서 작성"""
        application = {}
        
        for i, question in enumerate(questions):
            print(f"\n질문 {i+1}/{len(questions)} 작성 중: {question[:50]}...")
            answer = self.generate_self_introduction(job_posting_text, question)
            application[f"question_{i+1}"] = {
                "question": question,
                "answer": answer
            }
        
        return application
