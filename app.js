// إعداد مكتبة PDF.js للعمل في الخلفية لقراءة الصفحات
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';

// متغيرات عامة للنظام
let currentLang = 'ar';
let pdfPagesData = [];
let imageToPdfFiles = []; 
let html5QrCodeScanner = null;
let currentCameraStream = null;
let originalCanvasData = null; // للاحتفاظ بالصورة الأصلية للمستند قبل الفلاتر

// --- 1. التحكم بالقائمة والتبويبات ---
function toggleSidebar() {
    document.getElementById('sidebar-panel').classList.toggle('open');
}

function switchTab(tabId, menuItem) {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.sidebar-item').forEach(i => i.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
    menuItem.classList.add('active');
    document.getElementById('sidebar-panel').classList.remove('open');
    
    // إيقاف الكاميرات عند التنقل لتوفير موارد الجهاز
    if(tabId !== 'qr-tab') stopScanner();
    if(tabId !== 'scanner-tab') stopDocCamera();
}

function switchTabByIcon(index) {
    const items = document.querySelectorAll('.sidebar-item');
    if (items[index]) {
        items[index].click();
    }
}

// --- 2. دالة الاتصال الموحدة بـ Gemini API (يدعم النصوص والصور) ---
async function callGeminiAPI(promptText, base64Image = null, mimeType = null) {
    const apiKey = document.getElementById('global-api-key').value.trim();
    if (!apiKey) {
        alert("الرجاء إدخال مفتاح Gemini API في الحقل الأصفر بأعلى الصفحة أولاً لتفعيل ميزات الذكاء الاصطناعي!");
        return null;
    }

    // استخدام نموذج gemini-1.5-flash السريع والمتعدد الوسائط
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
    
    let contentsPayload = [];
    if (base64Image) {
        contentsPayload = [{
            parts: [
                { text: promptText },
                { inlineData: { mimeType: mimeType, data: base64Image } }
            ]
        }];
    } else {
        contentsPayload = [{
            parts: [{ text: promptText }]
        }];
    }

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: contentsPayload })
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || "فشل الاتصال بالخادم.");
    }

    const data = await response.json();
    return data.candidates[0].content.parts[0].text;
}

// --- 3. ماسح المستندات الذكي (Camera + Gemini API) ---
async function startDocCamera() {
    const video = document.getElementById('doc-video');
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        currentCameraStream = stream;
        video.srcObject = stream;
    } catch (err) {
        alert("لم نتمكن من تشغيل الكاميرا: " + err.message);
    }
}

function stopDocCamera() {
    if (currentCameraStream) {
        currentCameraStream.getTracks().forEach(track => track.stop());
        document.getElementById('doc-video').srcObject = null;
        currentCameraStream = null;
    }
}

function captureDocPage() {
    const video = document.getElementById('doc-video');
    const canvas = document.getElementById('doc-canvas');
    if (!currentCameraStream) {
        alert("الرجاء تشغيل الكاميرا أولاً!");
        return;
    }
    
    const context = canvas.getContext('2d');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    // الاحتفاظ بنسخة أصلية غير مفرزنة
    originalCanvasData = context.getImageData(0, 0, canvas.width, canvas.height);
    
    const imgPreview = document.getElementById('scanned-img-preview');
    imgPreview.src = canvas.toDataURL('image/jpeg');
    imgPreview.style.display = 'block';
    
    document.getElementById('scanner-placeholder').style.display = 'none';
    document.getElementById('scanner-controls').style.display = 'flex';
}

function applyScanFilter(filterType) {
    const canvas = document.getElementById('doc-canvas');
    const ctx = canvas.getContext('2d');
    if (!originalCanvasData) return;

    // إعادة الصورة للأصل أولاً
    ctx.putImageData(originalCanvasData, 0, 0);
    
    if (filterType === 'normal') {
        document.getElementById('scanned-img-preview').src = canvas.toDataURL('image/jpeg');
        return;
    }

    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imgData.data;

    for (let i = 0; i < data.length; i += 4) {
        let avg = (data[i] + data[i+1] + data[i+2]) / 3;
        if (filterType === 'grayscale') {
            data[i] = data[i+1] = data[i+2] = avg;
        } else if (filterType === 'threshold') {
            let bAndW = avg > 120 ? 255 : 0; // تباين عالي للمستندات الورقية
            data[i] = data[i+1] = data[i+2] = bAndW;
        }
    }
    ctx.putImageData(imgData, 0, 0);
    document.getElementById('scanned-img-preview').src = canvas.toDataURL('image/jpeg');
}

async function analyzeDocumentWithAI(action) {
    const canvas = document.getElementById('doc-canvas');
    const statusDiv = document.getElementById('ai-scanner-status');
    const resultTextarea = document.getElementById('ai-scanner-result');
    
    // تحويل الكانفاس إلى صيغة Base64 المطلوبة لـ Gemini API
    const dataUrl = canvas.toDataURL('image/jpeg');
    const base64Data = dataUrl.split(',')[1]; 

    let prompt = "قم بقراءة واستخراج كافة النصوص بداخل هذه الصورة بدقة وبنفس الترتيب وبشكل منسق (OCR).";
    if (action === 'summarize') {
        prompt = "قم بقراءة هذه الورقة الممسوحة ضوئياً واكتب ملخصاً شاملاً وذكياً لأهم الأفكار والبيانات الواردة فيها.";
    }

    statusDiv.innerHTML = "⏳ جاري معالجة المستند عبر ذكاء Gemini الاصطناعي...";
    resultTextarea.style.display = "none";

    try {
        const aiResponse = await callGeminiAPI(prompt, base64Data, "image/jpeg");
        if (aiResponse) {
            statusDiv.innerHTML = "✅ اكتمل التحليل بنجاح!";
            resultTextarea.value = aiResponse;
            resultTextarea.style.display = "block";
        }
    } catch (error) {
        statusDiv.innerHTML = "❌ خطأ أثناء الاتصال بالـ API: " + error.message;
    }
}

function sendScannedToConverter() {
    const canvas = document.getElementById('doc-canvas');
    canvas.toBlob((blob) => {
        const file = new File([blob], `scanned_doc_${Date.now()}.jpg`, { type: "image/jpeg" });
        imageToPdfFiles.push(file);
        
        // تحديث صندوق المعاينة في تبويب المحول
        const box = document.getElementById('img-preview-box');
        const reader = new FileReader();
        reader.onload = e => {
            box.innerHTML += `<div class="preview-item"><img src="${e.target.result}"></div>`;
        };
        reader.readAsDataURL(file);

        alert("تم تصدير الورقة بنجاح إلى تبويب المحول!");
        switchTabByIcon(4); // الانتقال التلقائي لتبويب المحول لإنشاء الـ PDF
    }, 'image/jpeg');
}

// --- 4. مساعد محادثة Gemini AI التفاعلي ---
async function askGemini() {
    const promptInput = document.getElementById('gemini-prompt');
    const chatOutput = document.getElementById('chat-output');
    const text = promptInput.value.trim();
    
    if (!text) return;

    // إضافة رسالة المستخدم للواجهة
    chatOutput.innerHTML += `<div class="chat-message user">${text}</div>`;
    promptInput.value = "";
    chatOutput.scrollTop = chatOutput.scrollHeight;

    // إضافة مؤشر الانتظار لـ AI
    const aiLoadingId = 'loading-' + Date.now();
    chatOutput.innerHTML += `<div class="chat-message ai" id="${aiLoadingId}">⏳ جاري التفكير...</div>`;
    chatOutput.scrollTop = chatOutput.scrollHeight;

    try {
        const response = await callGeminiAPI(text);
        document.getElementById(aiLoadingId).innerHTML = response.replace(/\n/g, "<br>");
    } catch (error) {
        document.getElementById(aiLoadingId).innerHTML = "❌ حدث خطأ: " + error.message;
    }
    chatOutput.scrollTop = chatOutput.scrollHeight;
}

// --- 5. أدوات الـ PDF (الدمج والتفكيك والترتيب) ---
async function handlePdfUpload(event) {
    const files = event.target.files;
    const previewBox = document.getElementById('merge-preview');
    
    for (const file of Array.from(files)) {
        const arrayBuffer = await file.arrayBuffer();
        const pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        
        for (let i = 1; i <= pdfDoc.numPages; i++) {
            const page = await pdfDoc.getPage(i);
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            const viewport = page.getViewport({ scale: 0.3 }); // دقة المعاينة السريعة
            
            canvas.height = viewport.height;
            canvas.width = viewport.width;
            await page.render({ canvasContext: context, viewport: viewport }).promise;
            
            const pageId = `page_${Date.now()}_${Math.random()}`;
            pdfPagesData.push({ id: pageId, origFile: file, pageIndex: i - 1 });
            
            const div = document.createElement('div');
            div.className = 'preview-item';
            div.setAttribute('data-id', pageId);
            div.innerHTML = `
                <button class="btn btn-danger" style="position:absolute; top:2px; left:2px; padding:2px 6px; font-size:10px; border-radius:50%;" onclick="removePageData('${pageId}', this)">×</button>
                <img src="${canvas.toDataURL()}">
                <div style="font-size:10px; text-align:center; padding:4px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${file.name} (ص ${i})</div>
            `;
            previewBox.appendChild(div);
        }
    }
}

function removePageData(id, element) {
    pdfPagesData = pdfPagesData.filter(p => p.id !== id);
    element.parentElement.remove();
}

async function executeMerge() {
    if(pdfPagesData.length === 0) { alert("الرجاء رفع ملفات PDF أولاً!"); return; }
    const { PDFDocument } = PDFLib;
    const finalPdf = await PDFDocument.create();
    
    for (const p of pdfPagesData) {
        const bytes = await p.origFile.arrayBuffer();
        const src = await PDFDocument.load(bytes);
        const [copied] = await finalPdf.copyPages(src, [p.pageIndex]);
        finalPdf.addPage(copied);
    }
    
    const bytes = await finalPdf.save();
    const blob = new Blob([bytes], {type: "application/pdf"});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = "GoodTech_Merged.pdf";
    a.click();
}

// --- 6. محول الصور إلى ملف PDF ---
function prepareImagesForPdf(event) {
    imageToPdfFiles = Array.from(event.target.files);
    const box = document.getElementById('img-preview-box');
    box.innerHTML = '';
    
    imageToPdfFiles.forEach(f => {
        const reader = new FileReader();
        reader.onload = e => {
            box.innerHTML += `<div class="preview-item"><img src="${e.target.result}"></div>`;
        };
        reader.readAsDataURL(f);
    });
}

async function convertImagesToPdf() {
    if(imageToPdfFiles.length === 0) { alert("الرجاء تحديد صور أولاً!"); return; }
    const { PDFDocument } = PDFLib;
    const pdfDoc = await PDFDocument.create();
    
    for (const file of imageToPdfFiles) {
        const bytes = await file.arrayBuffer();
        const img = file.type.includes('png') ? await pdfDoc.embedPng(bytes) : await pdfDoc.embedJpg(bytes);
        const page = pdfDoc.addPage([img.width, img.height]);
        page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
    }
    
    const pdfBytes = await pdfDoc.save();
    const blob = new Blob([pdfBytes], {type: "application/pdf"});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = "GoodTech_Images.pdf";
    a.click();
}

// --- 7. أدوات الـ QR Code (التوليد والمسح والتقاط اللقطة الشاشة) ---
function generateQRCode() {
    const text = document.getElementById('qr-text-input').value || "https://goodtech.app";
    document.getElementById('qr-output-box').innerHTML = "";
    new QRCode(document.getElementById('qr-output-box'), { text, width: 150, height: 150 });
}

function startScanner() {
    html5QrCodeScanner = new Html5Qrcode("reader-video-container");
    html5QrCodeScanner.start(
        { facingMode: "environment" }, 
        { fps: 15, qrbox: 220 }, 
        (decodedText) => { 
            document.getElementById('scanner-result').innerHTML = "🔗 تم المسح المباشر: " + decodedText; 
            stopScanner(); 
        }
    ).catch(() => {});
}

function stopScanner() {
    if (html5QrCodeScanner) {
        html5QrCodeScanner.stop().then(() => { html5QrCodeScanner = null; }).catch(() => {});
    }
}

// التقاط لقطة شاشة ثابتة من البث المباشر وفك شفرتها فوراً
async function captureQrSnapshot() {
    const video = document.querySelector('#reader-video-container video');
    if (!video) {
        alert("الرجاء تشغيل كاميرا الـ QR أولاً للالتقاط!");
        return;
    }
    const canvas = document.getElementById('qr-snapshot-canvas');
    const ctx = canvas.getContext('2d');
    
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    document.getElementById('scanner-result').innerHTML = "⏳ جاري فك وتفكيك محتوى اللقطة المأخوذة...";
    
    canvas.toBlob(async (blob) => {
        const file = new File([blob], "qr_snapshot.jpg", { type: "image/jpeg" });
        try {
            const staticScanner = new Html5Qrcode("reader-video-container");
            const result = await staticScanner.scanFile(file, false);
            document.getElementById('scanner-result').innerHTML = "📸 نتيجة الصورة الملتقطة: " + result;
            stopScanner();
        } catch (err) {
            document.getElementById('scanner-result').innerHTML = "❌ لم يتم العثور على رمز QR واضح في اللقطة الملتقطة، يرجى المحاولة بزاوية أفضل.";
        }
    }, 'image/jpeg');
}

function downloadQR() {
    const img = document.querySelector('#qr-output-box img');
    if(!img) { alert("الرجاء كتابة نص لتوليد الرمز أولاً!"); return; }
    const a = document.createElement('a');
    a.href = img.src;
    a.download = "GoodTech_QR.png";
    a.click();
}

// --- 8. تدويل ودعم اللغات (AR / EN) ---
function toggleLanguage() {
    currentLang = currentLang === 'ar' ? 'en' : 'ar';
    document.documentElement.dir = currentLang === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = currentLang;
    
    document.querySelectorAll('.lang-text').forEach(el => {
        el.innerText = el.getAttribute(`data-${currentLang}`);
    });
}
