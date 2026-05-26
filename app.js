// مصفوفة تخزين الملفات والصور محلياً لمعالجتها برمجياً
let uploadedPdfs = [];
let uploadedImagesForPdf = [];
let currentLang = 'ar';

// نظام إحداثيات نقاط التحكم الأربعة لقص المستند
let handles = {
    tl: { x: 0, y: 0, el: null },
    tr: { x: 0, y: 0, el: null },
    bl: { x: 0, y: 0, el: null },
    br: { x: 0, y: 0, el: null }
};

// 1. إدارة التنقل بين التبويبات بنظام لوحة التحكم العالمية
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

// 2. محرك تشغيل وإدارة كاميرا المستندات عالي السرعة
let videoStream;
async function startDocCamera() {
    const video = document.getElementById('doc-video');
    try {
        videoStream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } } 
        });
        video.srcObject = videoStream;
    } catch (err) {
        alert("فشل في استدعاء عدسة الكاميرا: " + err.message);
    }
}

function stopDocCamera() {
    if (videoStream) videoStream.getTracks().forEach(track => track.stop());
}

// 3. التقاط الصورة وإطلاق نظام المقابض التفاعلية (CamScanner Mode)
function captureDocPage() {
    const video = document.getElementById('doc-video');
    const canvas = document.getElementById('doc-canvas');
    const preview = document.getElementById('scanned-img-preview');
    
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    
    preview.src = canvas.toDataURL('image/png');
    
    document.getElementById('scanner-placeholder-box').style.display = 'none';
    document.getElementById('crop-wrapper').style.display = 'inline-block';
    document.getElementById('scanner-controls').style.display = 'block';
    
    // عند تحميل الصورة في الواجهة، نوزع زوايا السحب بشكل تلقائي متناسق مع الحواف
    preview.onload = function() {
        const w = preview.clientWidth;
        const h = preview.clientHeight;
        
        initializeHandle('tl', 40, 40);
        initializeHandle('tr', w - 40, 40);
        initializeHandle('bl', 40, h - 40);
        initializeHandle('br', w - 40, h - 40);
    };
}

function initializeHandle(key, x, y) {
    const el = document.getElementById('handle-' + key);
    el.style.display = 'block';
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    
    handles[key] = { x: x, y: y, el: el };
    if (!el.dataset.initialized) {
        bindDragEvent(key);
        el.dataset.initialized = "true";
    }
}

// 4. خوارزمية تتبع السحب واللمس الحركي المتطور للمقابض (Drag Mechanics)
function bindDragEvent(key) {
    const handle = handles[key].el;
    
    const moveHandler = (e) => {
        e.preventDefault();
        const container = document.getElementById('crop-wrapper').getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        
        let x = clientX - container.left;
        let y = clientY - container.top;
        
        x = Math.max(0, Math.min(x, container.width));
        y = Math.max(0, Math.min(y, container.height));
        
        handle.style.left = x + 'px';
        handle.style.top = y + 'px';
        
        handles[key].x = x;
        handles[key].y = y;
    };

    const stopHandler = () => {
        document.removeEventListener('mousemove', moveHandler);
        document.removeEventListener('mouseup', stopHandler);
        document.removeEventListener('touchmove', moveHandler);
        document.removeEventListener('touchend', stopHandler);
    };

    const startHandler = (e) => {
        document.addEventListener('mousemove', moveHandler);
        document.addEventListener('mouseup', stopHandler);
        document.addEventListener('touchmove', moveHandler, { passive: false });
        document.addEventListener('touchend', stopHandler);
    };

    handle.addEventListener('mousedown', startHandler);
    handle.addEventListener('touchstart', startHandler, { passive: false });
}

// 5. محرك التعديل الهندسي وتصحيح المنظور ثلاثي الأبعاد (Perspective Warp Engine)
function processPerspectiveWarp() {
    if (typeof cv === 'undefined' || !cv.Mat) {
        alert("يرجى الانتظار لبضع ثوانٍ لحين اكتمال تحميل خوارزميات المعالجة المحلية OpenCV...");
        return;
    }
    
    let src = cv.imread('doc-canvas');
    let dst = new cv.Mat();
    
    const preview = document.getElementById('scanned-img-preview');
    const scaleX = src.cols / preview.clientWidth;
    const scaleY = src.rows / preview.clientHeight;
    
    // تحويل إحداثيات شاشة العرض للمقاييس الحقيقية للمصفوفة الرقمية للصورة الأصلية
    let pTL = [handles.tl.x * scaleX, handles.tl.y * scaleY];
    let pTR = [handles.tr.x * scaleX, handles.tr.y * scaleY];
    let pBL = [handles.bl.x * scaleX, handles.bl.y * scaleY];
    let pBR = [handles.br.x * scaleX, handles.br.y * scaleY];
    
    // حساب الأبعاد الحقيقية المثالية للمستند الناتج تلقائياً
    let widthTop = Math.hypot(pTR[0] - pTL[0], pTR[1] - pTL[1]);
    let widthBottom = Math.hypot(pBR[0] - pBL[0], pBR[1] - pBL[1]);
    let targetWidth = Math.max(widthTop, widthBottom);
    
    let heightRight = Math.hypot(pTR[0] - pBR[0], pTR[1] - pBR[1]);
    let heightLeft = Math.hypot(pTL[0] - pBL[0], pTL[1] - pBL[1]);
    let targetHeight = Math.max(heightRight, heightLeft);
    
    let srcCoords = cv.matFromArray(4, 1, cv.CV_32FC2, [
        pTL[0], pTL[1],  pTR[0], pTR[1],
        pBR[0], pBR[1],  pBL[0], pBL[1]
    ]);
    
    let dstCoords = cv.matFromArray(4, 1, cv.CV_32FC2, [
        0, 0,  targetWidth, 0,
        targetWidth, targetHeight,  0, targetHeight
    ]);
    
    // تطبيق المعالجة المباشرة والقص المتقدم للزوايا
    let transformMatrix = cv.getPerspectiveTransform(srcCoords, dstCoords);
    let dsize = new cv.Size(targetWidth, targetHeight);
    cv.warpPerspective(src, dst, transformMatrix, dsize);
    
    cv.imshow('transformed-canvas', dst);
    
    // تحديث واجهة المعاينة بالصورة المستوية الجديدة وإخفاء مقابض السحب
    preview.src = document.getElementById('transformed-canvas').toDataURL();
    document.querySelectorAll('.crop-handle').forEach(h => h.style.display = 'none');
    
    // إخلاء الذاكرة المؤقتة لـ OpenCV لضمان السرعة الفائقة
    src.delete(); dst.delete(); srcCoords.delete(); dstCoords.delete(); transformMatrix.delete();
}

// 6. فلاتر التصفية ومعالجة حبر المستندات (B&W Scan Filters)
function applyScanFilter(filter) {
    const activeCanvas = document.getElementById('transformed-canvas').width > 0 ? 'transformed-canvas' : 'doc-canvas';
    let src = cv.imread(activeCanvas);
    let dst = new cv.Mat();
    
    if (filter === 'grayscale') {
        cv.cvtColor(src, dst, cv.COLOR_RGBA2GRAY);
        cv.imshow('transformed-canvas', dst);
    } else if (filter === 'threshold') {
        cv.cvtColor(src, dst, cv.COLOR_RGBA2GRAY);
        cv.adaptiveThreshold(dst, dst, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, 11, 2);
        cv.imshow('transformed-canvas', dst);
    } else {
        cv.imshow('transformed-canvas', src);
    }
    
    document.getElementById('scanned-img-preview').src = document.getElementById('transformed-canvas').toDataURL();
    src.delete(); dst.delete();
}

// 7. ربط المعالجة الذكية السحابية المباشرة بـ Gemini API لمعالجة الصورة المستخرجة ومسحها
async function analyzeDocumentWithAI(type) {
    const apiKey = document.getElementById('global-api-key').value;
    const status = document.getElementById('ai-scanner-status');
    const resultArea = document.getElementById('ai-scanner-result');
    
    if (!apiKey) {
        alert("يرجى تزويد المنصة بمفتاح Gemini API أولاً لمعالجة الورقة سحابياً.");
        return;
    }
    
    status.innerText = "جاري رفع الصورة وتحليل المستند هندسياً عبر لغة جيميناي الفورية...";
    resultArea.style.display = 'block';
    resultArea.value = "";
    
    const canvas = document.getElementById('transformed-canvas').width > 0 ? document.getElementById('transformed-canvas') : document.getElementById('doc-canvas');
    const base64Data = canvas.toDataURL('image/jpeg').split(',')[1];
    
    let prompt = "قم باستخراج كل النصوص المقروءة والجدولية من هذا المستند بشكل منسق واحترافي.";
    if (type === 'summarize') prompt = "قم بقراءة هذا المستند وتلخيصه في نقاط تنفيذية باللغة العربية.";
    
    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }, { inlineData: { mimeType: "image/jpeg", data: base64Data } }] }]
            })
        });
        
        const data = await response.json();
        resultArea.value = data.candidates[0].content.parts[0].text;
        status.innerText = "اكتملت معالجة النص المستنداتي الذكي.";
    } catch (err) {
        status.innerText = "خطأ أثناء الاتصال بـ API.";
        resultArea.value = err.message;
    }
}

function sendScannedToConverter() {
    const canvas = document.getElementById('transformed-canvas').width > 0 ? document.getElementById('transformed-canvas') : document.getElementById('doc-canvas');
    uploadedImagesForPdf.push(canvas.toDataURL('image/png'));
    renderImagePreviews();
    switchTab('converter-tab', document.querySelectorAll('.nav-link')[3]);
}

// 8. منطق أدوات الـ PDF (الدمج والتحويل الفوري محلياً عبر أداء المتصفح)
async function handlePdfUpload(event) {
    for (let file of event.target.files) {
        uploadedPdfs.push({ name: file.name, buffer: await file.arrayBuffer() });
    }
    const previewBox = document.getElementById('merge-preview');
    previewBox.innerHTML = uploadedPdfs.map(p => `<div class="preview-item" style="color:white; font-size:11px; padding:5px; text-align:center; background:#ef4444;">${p.name.substring(0,10)}...</div>`).join('');
}

async function executeMerge() {
    if (uploadedPdfs.length === 0) return alert("قم بإدراج الملفات أولاً.");
    const mergedPdf = await PDFLib.PDFDocument.create();
    for (let pdfObj of uploadedPdfs) {
        const pdf = await PDFLib.PDFDocument.load(pdfObj.buffer);
        const pages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
        pages.forEach(p => mergedPdf.addPage(p));
    }
    const bytes = await mergedPdf.save();
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    link.download = 'Universal_Suite_Merge.pdf';
    link.click();
}

async function prepareImagesForPdf(event) {
    for (let file of event.target.files) {
        const reader = new FileReader();
        reader.onload = (e) => { uploadedImagesForPdf.push(e.target.result); renderImagePreviews(); };
        reader.readAsDataURL(file);
    }
}

function renderImagePreviews() {
    document.getElementById('img-preview-box').innerHTML = uploadedImagesForPdf.map(src => `<div class="preview-item"><img src="${src}"></div>`).join('');
}

async function convertImagesToPdf() {
    if (uploadedImagesForPdf.length === 0) return alert("لا توجد صور ممسوحة للمعالجة.");
    const pdfDoc = await PDFLib.PDFDocument.create();
    for (let img64 of uploadedImagesForPdf) {
        const page = pdfDoc.addPage();
        const imgEmbed = img64.includes('image/png') ? await pdfDoc.embedPng(img64) : await pdfDoc.embedJpg(img64);
        page.drawImage(imgEmbed, { x: 0, y: 0, width: page.getSize().width, height: page.getSize().height });
    }
    const bytes = await pdfDoc.save();
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    link.download = 'Scanned_Images_Document.pdf';
    link.click();
}

// 9. محرك الـ QR Code العالمي
function generateQRCode() {
    const text = document.getElementById('qr-text-input').value;
    const output = document.getElementById('qr-output-box');
    output.innerHTML = "";
    if (text) new QRCode(output, { text: text, width: 200, height: 200 });
}

function downloadQR() {
    const canvas = document.querySelector('#qr-output-box canvas');
    if (canvas) {
        const link = document.createElement('a');
        link.download = 'universal_qr.png';
        link.href = canvas.toDataURL();
        link.click();
    }
}

// 10. محول اللغات العالمي الديناميكي (عربي / إنجليزي)
function toggleLanguage() {
    currentLang = currentLang === 'ar' ? 'en' : 'ar';
    document.documentElement.dir = currentLang === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = currentLang;
    document.querySelectorAll('.lang-text').forEach(el => el.innerText = el.getAttribute('data-' + currentLang));
    document.querySelector('.lang-switcher span').innerText = currentLang === 'ar' ? 'English' : 'العربية';
}
