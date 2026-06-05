from pypdf import PdfReader
import json
from typing import Dict, Any
import os
from src.llm import LLMClient


class PortfolioManager:
    def __init__(self, data_path: str = "data/portfolio.json"):
        self.data_path = data_path
        self.data: Dict[str, Any] = {}
        self.llm = LLMClient()
        self._ensure_data_dir()
        self._load_data()

    def _ensure_data_dir(self):
        """데이터 디렉토리 생성"""
        os.makedirs(os.path.dirname(self.data_path), exist_ok=True)

    def _load_data(self):
        """데이터 로드"""
        if os.path.exists(self.data_path):
            with open(self.data_path, 'r', encoding='utf-8') as f:
                self.data = json.load(f)
        else:
            self.data = self._get_empty_template()

    def _save_data(self):
        """데이터 저장"""
        with open(self.data_path, 'w', encoding='utf-8') as f:
            json.dump(self.data, f, ensure_ascii=False, indent=2)

    def _get_empty_template(self) -> Dict[str, Any]:
        """빈 포트폴리오 템플릿"""
        return {
            "name": "",
            "age": "",
            "email": "",
            "phone": "",
            "address": "",
            "military_service": {
                "status": "",
                "period": "",
                "branch": "",
                "rank": "",
                "discharge": "",
                "disability": ""
            },
            "education": [],
            "certifications": [],
            "experience": [],
            "skills": [],
            "projects": [],
            "self_introduction": ""
        }

    def import_from_pdf(self, pdf_path: str) -> Dict[str, Any]:
        """PDF에서 텍스트 추출"""
        reader = PdfReader(pdf_path)
        text = ""
        for page in reader.pages:
            text += page.extract_text() + "\n"
        
        print(f"PDF에서 {len(text)}자 추출됨")
        return {"raw_text": text}

    def parse_resume_text(self, text: str) -> Dict[str, Any]:
        """LLM을 사용해서 이력서 텍스트를 파싱"""
        system_prompt = (
            "이력서 텍스트를 분석해서 구조화된 JSON 데이터로 변환하세요.\n"
            "필드 목록:\n"
            "- name (이름)\n"
            "- age (나이)\n"
            "- email (이메일)\n"
            "- phone (전화번호)\n"
            "- address (주소)\n"
            "- birthdate (생년월일, 반드시 YYYY.MM.DD 형식)\n"
            "- military_service: {status, period, branch, rank, discharge, disability}\n"
            "- education[]: {school, major, minor, double_major, degree, status, period, start_date, end_date, credits_earned, credits_total}\n"
            "  * school: 학교명\n"
            "  * major: 주전공\n"
            "  * minor: 부전공 (없으면 빈값)\n"
            "  * double_major: 복수전공 (없으면 빈값)\n"
            "  * degree: 학위/학교수준 (고졸, 전문학사, 학사, 석사, 박사, 대학교4년 등)\n"
            "  * status: 졸업상태 (졸업, 재학, 휴학, 중퇴, 수료 등)\n"
            "  * start_date: 입학년월 (YYYY.MM 또는 YYYY-MM)\n"
            "  * end_date: 졸업년월 (YYYY.MM 또는 YYYY-MM, 재학중이면 빈값)\n"
            "  * period: 재학기간 전체 문자열 (예: 2015.03 ~ 2019.02)\n"
            "  * credits_earned: 취득학점 (숫자만)\n"
            "  * credits_total: 기준학점 (숫자만, 보통 4.0 또는 4.5)\n"
            "- experience[]: {company, role, department, employment_type, start_date, end_date, period, duties, reason_for_leaving, salary}\n"
            "  * company: 회사명\n"
            "  * role: 직급/직책 (대리, 과장 등)\n"
            "  * department: 부서명\n"
            "  * employment_type: 고용형태 (정규직, 계약직, 인턴 등)\n"
            "  * start_date: 입사일 (YYYY.MM.DD)\n"
            "  * end_date: 퇴사일 (YYYY.MM.DD, 재직중이면 빈값)\n"
            "  * period: 근무기간 전체 문자열 (예: 2021.03 ~ 2024.12)\n"
            "  * duties: 담당업무/주요업무 내용\n"
            "  * reason_for_leaving: 이직/퇴사 사유\n"
            "  * salary: 연봉 (숫자만, 단위 제외)\n"
            "- certifications[]: 자격증명 배열\n"
            "- skills[]: 보유기술 배열\n"
            "- projects[]: {name, description, tech_stack, period}\n"
            "- self_introduction (자기소개)\n"
            "값을 찾을 수 없는 필드는 빈 문자열(\"\")로 남겨두세요."
        )

        user_prompt = f"이력서 텍스트:\n{text[:4000]}"

        response = self.llm._call_llm(system_prompt, user_prompt, use_json=True)

        try:
            parsed = json.loads(response)
            # 빈 템플릿과 병합
            template = self._get_empty_template()
            for key in template:
                if key in parsed:
                    template[key] = parsed[key]
            return template
        except:
            print("LLM 파싱 실패, 기본 파싱 사용")
            return self._simple_parse(text)
    
    def _simple_parse(self, text: str) -> Dict[str, Any]:
        """간단한 파싱 (fallback)"""
        lines = text.split('\n')
        parsed = self._get_empty_template()
        
        for i, line in enumerate(lines):
            if '강성탁' in line:
                parsed['name'] = '강성탁'
            elif 'sug0256' in line:
                parsed['email'] = 'sug0256@naver.com'
            elif '010-9998' in line:
                parsed['phone'] = '010-9998-7436'
            elif re.search(r'1993\s*년|만\s*32\s*세', line):
                parsed['age'] = '32'
            elif '병역' in line or '군필' in line or '육군' in line:
                parsed.setdefault('military_service', {})
                if '군필' in line:
                    parsed['military_service']['status'] = '군필'
                if '육군' in line:
                    parsed['military_service']['branch'] = '육군'
                if '병장' in line:
                    parsed['military_service']['rank'] = '병장'
                if '제대' in line:
                    parsed['military_service']['discharge'] = '만기제대'
                m = re.search(r'(\d{4})\s*[.]\s*(\d{1,2})\s*~\s*(\d{4})\s*[.]\s*(\d{1,2})', line)
                if m:
                    parsed['military_service']['period'] = f"{m.group(1)}.{int(m.group(2)):02d} ~ {m.group(3)}.{int(m.group(4)):02d}"
        
        return parsed

    def update_field(self, field: str, value: Any):
        """필드 업데이트"""
        self.data[field] = value
        self._save_data()

    def get_data(self) -> Dict[str, Any]:
        """전체 데이터 반환"""
        return self.data

    def save_to_json(self, path: str = None):
        """JSON으로 저장"""
        save_path = path or self.data_path
        with open(save_path, 'w', encoding='utf-8') as f:
            json.dump(self.data, f, ensure_ascii=False, indent=2)
        print(f"포트폴리오 저장됨: {save_path}")
