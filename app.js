// 1. التبديل بين التبويبات
function switchTab(tabId, btn) {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.nav-link').forEach(n => n.classList.remove('active'));
    
    document.getElementById(tabId).classList.add('active');
    if(btn) btn.classList.add('active');
}

function switchTabByIcon(index) {
    const buttons = document.querySelectorAll('.nav-link');
    if (buttons[index]) buttons[index].click();
}

// 2. إدارة الكاميرا (للمسح الضوئي)
let videoStream;
async function startDocCamera() {
    const video = document.getElementById('doc-video');
    try {
        videoStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        video.srcObject = videoStream;
    } catch (err) {
        alert("فشل الوصول للكاميرا: " + err.message);
    }
}

function stopDocCamera() {
    if (videoStream) videoStream.getTracks().forEach(track => track.stop());
}

function captureDocPage() {
    const video = document.getElementById('doc-video');
    const canvas = document.getElementById('doc-canvas');
    const preview = document.getElementById('scanned-img-preview');
    
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    
    preview.src = canvas.toDataURL('image/png');
    preview.style.display = 'block';
    document.getElementById('scanner-placeholder').style.display = 'none';
    document.getElementById('scanner-controls').style.display = 'block';
}

// 3. محاكاة معالجة الذكاء الاصطناعي (AI Direct)
function analyzeDocumentWithAI(type) {
    const status = document.getElementById('ai-scanner-status');
    const resultArea = document.getElementById('ai-scanner-result');
    
    status.innerText = "جاري التحليل عبر الذكاء الاصطناعي...";
    resultArea.style.display = 'block';
    
    // محاكاة استجابة المعالجة
    setTimeout(() => {
        if(type === 'ocr') {
            resultArea.value = "نص مستخرج تجريبي: مرحبًا بك في النظام الشامل، تم مسح المستند بنجاح.";
            status.innerText = "تم استخراج النص.";
        } else {
            resultArea.value = "ملخص: هذا المستند يحتوي على معلومات عامة للنظام الشامل.";
            status.innerText = "تم التلخيص.";
        }
    }, 1500);
}

// 4. توليد QR Code
function generateQRCode() {
    const text = document.getElementById('qr-text-input').value;
    const output = document.getElementById('qr-output-box');
    output.innerHTML = "";
    if (text.length > 0) {
        new QRCode(output, { text: text, width: 200, height: 200 });
    }
}

function downloadQR() {
    const canvas = document.querySelector('#qr-output-box canvas');
    if (canvas) {
        const link = document.createElement('a');
        link.download = 'qrcode.png';
        link.href = canvas.toDataURL();
        link.click();
    }
}

// 5. وظائف إضافية
function applyScanFilter(filter) {
    const img = document.getElementById('scanned-img-preview');
    img.style.filter = filter === 'grayscale' ? 'grayscale(100%)' : 
                       filter === 'threshold' ? 'contrast(200%) grayscale(100%)' : 'none';
}
