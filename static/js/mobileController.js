// 移动端虚拟按键控制器
// 仅在触摸设备上启用；复用 pcController.js 定义的全局 p1，键盘与触屏共用一份输入状态
(function () {
	var isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
	if (!isTouch || typeof p1 === 'undefined') return;

	// 禁止页面滚动/缩放，避免拖动画面
	document.body.addEventListener('touchmove', function (e) {
		e.preventDefault();
	}, { passive: false });

	var box = document.querySelector('.mobileController');
	if (!box) return;
	box.style.display = 'block';

	var KEY = {
		l: 'left',
		r: 'right',
		u: 'up',
		d: 'down',
		a: 'item'
	};

	function press (name) {
		if (!p1[name + 'Down']) {
			p1[name + 'Press'] = true;
		}
		p1[name + 'Down'] = true;
	}
	function release (name) {
		p1[name + 'Down'] = false;
	}

	function act (target, isDown) {
		var name = KEY[target.getAttribute('data-act')];
		if (!name) return;
		if (isDown) {
			press(name);
		} else {
			release(name);
		}
	}

	box.addEventListener('touchstart', function (e) {
		act(e.target, true);
		e.preventDefault();
	}, { passive: false });
	box.addEventListener('touchend', function (e) {
		act(e.target, false);
	}, { passive: false });
	box.addEventListener('touchcancel', function (e) {
		act(e.target, false);
	}, { passive: false });
})();
