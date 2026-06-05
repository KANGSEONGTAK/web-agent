from flask import Flask, request, jsonify
from flask_cors import CORS
import sys
import os

# src 디렉토리를 경로에 추가
project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, project_root)

from src.portfolio import PortfolioManager
from src.resume_writer import ResumeWriter
from src.parser import TaskParser

app = Flask(__name__)
CORS(app)

# 전역 포트폴리오 매니저 (세션 기반)
portfolio_manager = None
resume_writer = ResumeWriter()
task_parser = TaskParser()

@app.route('/api/health', methods=['GET'])
def health_check():
    return jsonify({"status": "ok"})

@app.route('/api/portfolio/upload', methods=['POST'])
def upload_portfolio():
    """PDF 업로드 및 파싱"""
    global portfolio_manager
    
    if 'file' not in request.files:
        return jsonify({"error": "No file uploaded"}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({"error": "No file selected"}), 400
    
    if not file.filename.endswith('.pdf'):
        return jsonify({"error": "Only PDF files are supported"}), 400
    
    try:
        # 임시 파일 저장
        temp_path = f"temp_{file.filename}"
        file.save(temp_path)
        
        # 파싱
        portfolio_manager = PortfolioManager()
        portfolio_manager.import_from_pdf(temp_path)
        
        # 임시 파일 삭제
        os.remove(temp_path)
        
        return jsonify({
            "status": "success",
            "data": portfolio_manager.get_data()
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/portfolio', methods=['GET'])
def get_portfolio():
    """포트폴리오 데이터 조회"""
    global portfolio_manager
    
    if portfolio_manager is None:
        return jsonify({"error": "No portfolio uploaded"}), 400
    
    return jsonify(portfolio_manager.get_data())

@app.route('/api/portfolio', methods=['DELETE'])
def delete_portfolio():
    """포트폴리오 삭제"""
    global portfolio_manager
    portfolio_manager = None
    return jsonify({"status": "success"})

@app.route('/api/resume/parse-profile', methods=['POST'])
def parse_resume_profile():
    """이력서 PDF를 업로드받아 텍스트 추출 후 구조화된 프로필(JSON)로 반환"""
    if 'file' not in request.files:
        return jsonify({"error": "No file uploaded"}), 400

    file = request.files['file']
    if file.filename == '':
        return jsonify({"error": "No file selected"}), 400
    if not file.filename.lower().endswith('.pdf'):
        return jsonify({"error": "Only PDF files are supported"}), 400

    temp_path = f"temp_resume_{file.filename}"
    try:
        file.save(temp_path)
        pm = PortfolioManager()
        extracted = pm.import_from_pdf(temp_path)
        profile = pm.parse_resume_text(extracted.get("raw_text", ""))
        return jsonify({"status": "success", "profile": profile})
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        if os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except OSError:
                pass

@app.route('/api/resume/analyze', methods=['POST'])
def analyze_job_posting():
    """채용 공고 분석"""
    data = request.json
    job_posting = data.get('job_posting', '')
    
    if not job_posting:
        return jsonify({"error": "No job posting provided"}), 400
    
    try:
        analysis = resume_writer.analyze_job_posting(job_posting)
        return jsonify({"status": "success", "data": analysis})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/resume/write', methods=['POST'])
def write_self_introduction():
    """자기소개서 작성"""
    data = request.json
    job_posting = data.get('job_posting', '')
    question = data.get('question', '')
    
    if not job_posting:
        return jsonify({"error": "No job posting provided"}), 400
    
    try:
        self_intro = resume_writer.generate_self_introduction(job_posting, question)
        return jsonify({"status": "success", "data": {"self_introduction": self_intro}})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/resume/tips', methods=['POST'])
def generate_tips():
    """합격률 팁 생성"""
    data = request.json
    job_posting = data.get('job_posting', '')
    
    if not job_posting:
        return jsonify({"error": "No job posting provided"}), 400
    
    try:
        tips = resume_writer.generate_success_tips(job_posting)
        return jsonify({"status": "success", "data": tips})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/agent/step', methods=['POST'])
def agent_step():
    """에이전트 루프의 한 스텝: 현재 페이지 상태를 받아 다음 액션 1개를 결정"""
    data = request.json or {}
    goal = data.get('goal', '')
    url = data.get('url', '')
    title = data.get('title', '')
    elements = data.get('elements', [])
    page_text = data.get('page_text', '')
    history = data.get('history', [])
    sensitive_approved = data.get('sensitive_approved', False)
    conversation = data.get('conversation', [])
    resume_profile = data.get('resume_profile', None)

    if not goal:
        return jsonify({"error": "No goal provided"}), 400

    try:
        action = task_parser.decide_next_action(
            goal=goal,
            url=url,
            title=title,
            elements=elements,
            page_text=page_text,
            history=history,
            sensitive_approved=sensitive_approved,
            conversation=conversation,
            resume_profile=resume_profile,
        )
        return jsonify({"status": "success", "action": action})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/agent/map-fields', methods=['POST'])
def map_fields():
    """빈 입력 필드들을 이력서 데이터와 일괄 매칭 (Two-Pass의 Pass 1)."""
    data = request.json
    elements = data.get('elements', [])
    resume_profile = data.get('resume_profile', None)
    learned_prompt = data.get('learned_prompt', '')

    print(f"[map-fields] Received {len(elements)} elements for mapping")
    if learned_prompt:
        print(f"[map-fields] Learned prompt included ({len(learned_prompt)} chars)")
    for el in elements:
        print(f"  - idx={el.get('index')} tag={el.get('tag')} label={el.get('label','')}")

    if not elements:
        return jsonify({"status": "success", "mappings": [], "unmatched": [], "matched_count": 0})

    try:
        result = task_parser.map_fields(
            elements=elements,
            resume_profile=resume_profile,
            learned_prompt=learned_prompt,
        )
        print(f"[map-fields] Result: {result.get('matched_count', 0)} matched, {len(result.get('unmatched', []))} unmatched")
        for m in result.get('mappings', [])[:5]:
            print(f"  -> idx={m.get('index')} label={m.get('label','')} value={m.get('value','')[:30]}")
        return jsonify({"status": "success", **result})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5000)
