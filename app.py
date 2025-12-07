import os
import cv2
import base64
import openai as kolosal
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from werkzeug.utils import secure_filename
import PyPDF2
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
CORS(app)

# === KONFIGURASI KOLOSAL AI ===
API_KEY = os.getenv("KOLOSAL_API_KEY")
if not API_KEY:
    raise EnvironmentError("KOLOSAL_API_KEY tidak ditemukan di file .env")

# ✅ FIX: HAPUS SPASI DI AKHIR URL!
KOLOSAL_BASE_URL = "https://api.kolosal.ai/v1"  # ⬅️ INI YANG BENAR
MODEL_NAME = "Claude Sonnet 4.5"

# === UPLOAD ===
UPLOAD_FOLDER = 'uploads'
ALLOWED_EXTENSIONS = {'txt', 'pdf', 'png', 'jpg', 'jpeg', 'mp4', 'mov', 'avi'}
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

# === INISIALISASI CLIENT ===
try:
    ai_client = kolosal.OpenAI(api_key=API_KEY, base_url=KOLOSAL_BASE_URL)
    print("✅ Kolosal AI (Claude) siap digunakan!")
except Exception as e:
    print(f"❌ Gagal inisialisasi AI: {e}")
    ai_client = None

# === HELPER FUNCTIONS ===
def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def encode_image_to_base64(image_path):
    with open(image_path, "rb") as f:
        return base64.b64encode(f.read()).decode('utf-8')

def extract_text_from_pdf(file_path):
    text = ""
    try:
        with open(file_path, 'rb') as f:
            reader = PyPDF2.PdfReader(f)
            for page in reader.pages:
                text += (page.extract_text() or "") + "\n"
    except Exception as e:
        return f"[Gagal ekstrak PDF: {str(e)}]"
    return text

def process_video_frames(video_path):
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        return []
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    if total_frames == 0:
        cap.release()
        return []
    frame_indices = [int(total_frames * 0.1), int(total_frames * 0.5), int(total_frames * 0.9)]
    frames_base64 = []
    for idx in frame_indices:
        cap.set(cv2.CAP_PROP_POS_FRAMES, idx)
        ret, frame = cap.read()
        if ret:
            frame = cv2.resize(frame, (640, 360))
            _, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
            frames_base64.append(base64.b64encode(buffer).decode('utf-8'))
    cap.release()
    return frames_base64

def safe_remove_file(path):
    try:
        os.remove(path)
    except:
        pass

# === ROUTES ===
@app.route('/')
def index():
    return send_from_directory('templates', 'index.html')

@app.route('/api/chat', methods=['POST'])
def chat():
    user_message = request.form.get('message', '').strip()
    context_data = {'type': 'none', 'content': ''}
    file_path = None

    try:
        if 'file' in request.files:
            file = request.files['file']
            if file and file.filename != '' and allowed_file(file.filename):
                filename = secure_filename(file.filename)
                file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
                file.save(file_path)

                ext = filename.rsplit('.', 1)[1].lower()
                if ext == 'pdf':
                    context_data['type'] = 'text'
                    context_data['content'] = extract_text_from_pdf(file_path)
                elif ext == 'txt':
                    try:
                        with open(file_path, 'r', encoding='utf-8') as f:
                            context_data['content'] = f.read()
                        context_data['type'] = 'text'
                    except Exception as e:
                        return jsonify({"reply": f"Gagal baca file teks: {str(e)}"})
                elif ext in ['jpg', 'jpeg', 'png']:
                    context_data['type'] = 'image'
                    context_data['content'] = encode_image_to_base64(file_path)
                elif ext in ['mp4', 'mov', 'avi']:
                    frames = process_video_frames(file_path)
                    if frames:
                        context_data['type'] = 'video_frames'
                        context_data['content'] = frames
                    else:
                        return jsonify({"reply": "Gagal memproses video. Coba file lain."})

        if ai_client is None:
            reply = "Maaf, AI sedang maintenance. Coba lagi nanti."
        else:
            system_prompt = (
                "Anda adalah Bambang & Siti, asisten keuangan UMKM dari tim Faril, Zhafran, Dandi. "
                "Beri respons dalam Bahasa Indonesia yang santai dan membantu. "
                "FORMAT WAJIB:\n"
                "- Sapa dengan 'Mas' atau 'Mbak'\n"
                "- Tulis setiap poin di baris terpisah\n"
                "- Gunakan bullet sederhana: •\n"
                "- JANGAN gunakan markdown atau tebal\n"
                "- Akhiri dengan kalimat penyemangat + emotikon 😊💡\n"
                "Jangan sebut AI, Kolosal, atau Claude. Fokus bantu UMKM."
            )

            user_content = [{"type": "text", "text": user_message or "Analisis data yang dikirim."}]
            if context_data['type'] == 'text':
                user_content.append({"type": "text", "text": f"\n\nDOKUMEN:\n{context_data['content']}"})
            elif context_data['type'] == 'image':
                user_content.append({
                    "type": "image_url",
                    "image_url": {"url": f"data:image/jpeg;base64,{context_data['content']}"}
                })
            elif context_data['type'] == 'video_frames':
                user_content.append({"type": "text", "text": "Berikut frame dari video Anda:"})
                for frame in context_data['content']:
                    user_content.append({
                        "type": "image_url",
                        "image_url": {"url": f"data:image/jpeg;base64,{frame}"}
                    })

            response = ai_client.chat.completions.create(
                model=MODEL_NAME,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_content}
                ],
                max_tokens=2048,
                temperature=0.7
            )
            reply = response.choices[0].message.content

        return jsonify({"reply": reply})

    except Exception as e:
        print(f"Error di /api/chat: {e}")
        return jsonify({"reply": "Maaf, gagal memproses gambar. Coba lagi!"})
    finally:
        if file_path and os.path.exists(file_path):
            safe_remove_file(file_path)

# === JALANKAN ===
if __name__ == '__main__':
    # ✅ FIX: Ganti ke 0.0.0.0 agar HP bisa akses
    app.run(debug=True, host='localhost', port=8000)
