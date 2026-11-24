// 도시 페이지 공통 동작: 주소·번호 복사 버튼, 맨 위로 버튼
(function () {
    var toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = '복사했어요 ✅';
    document.body.appendChild(toast);

    function showToast() {
        toast.classList.add('show');
        setTimeout(function () { toast.classList.remove('show'); }, 1500);
    }

    function fallbackCopy(text) {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'absolute';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); showToast(); } catch (e) { /* 복사 불가 */ }
        document.body.removeChild(ta);
    }

    document.querySelectorAll('[data-copy]').forEach(function (btn) {
        btn.addEventListener('click', function () {
            var text = btn.getAttribute('data-copy');
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(text).then(showToast, function () { fallbackCopy(text); });
            } else {
                fallbackCopy(text);
            }
        });
    });

    var top = document.querySelector('.to-top');
    if (top) top.addEventListener('click', function () { window.scrollTo({ top: 0, behavior: 'smooth' }); });
})();
