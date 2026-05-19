// ===== YUT THROW 2D ANIMATION (fallback / control-panel reveal) =====

const YUT_ANIM = (() => {
  const X_RANGE = 82;
  const Y_RANGE = 22;
  const PEAK_Y  = -130;
  const EASING  = 'cubic-bezier(0.15, 0.5, 0.3, 1)';

  function makeStickEl() {
    const stick = htmlEl('div', { className: 'throw-stick' });
    const inner = htmlEl('div', { className: 'stick-inner' });
    const front = htmlEl('div', { className: 'stick-face front-face' });
    const back  = htmlEl('div', { className: 'stick-face back-face' });
    inner.appendChild(front);
    inner.appendChild(back);
    stick.appendChild(inner);
    return { stick, inner };
  }

  // Random landing parameters for one stick
  function stickFlightParams(isBack, index) {
    return {
      tx:      (Math.random() * 2 - 1) * X_RANGE,
      ty:      (Math.random() * 2 - 1) * Y_RANGE,
      tiltZ:   (Math.random() * 2 - 1) * 50,
      finalRx: (4 + Math.floor(Math.random() * 4)) * 360 + (isBack ? 180 : 0),
      delay:   index * 100 + Math.random() * 100,
      duration: 4500 + Math.random() * 2700,
    };
  }

  function animateStick(stick, inner, p) {
    const peakX = p.tx * 0.2;
    stick.animate(
      [
        { transform: 'translate(-50%, -50%) rotateZ(0deg)' },
        { transform: `translate(calc(-50% + ${peakX}px), calc(-50% + ${PEAK_Y}px)) rotateZ(${p.tiltZ * 0.3}deg)`, offset: 0.35 },
        { transform: `translate(calc(-50% + ${p.tx}px), calc(-50% + ${p.ty}px)) rotateZ(${p.tiltZ}deg)` },
      ],
      { duration: p.duration, delay: p.delay, easing: EASING, fill: 'both' }
    );
    inner.animate(
      [
        { transform: 'rotateX(0deg)' },
        { transform: `rotateX(${p.finalRx}deg)` },
      ],
      { duration: p.duration, delay: p.delay, easing: EASING, fill: 'both' }
    );
  }

  function resetResultDom(resultEl, throwArea, nameEl, stepsEl) {
    resultEl.classList.remove('hidden');
    throwArea.innerHTML = '';
    nameEl.textContent  = '';
    nameEl.classList.remove('reveal');
    stepsEl.textContent = '';
  }

  function revealResult(nameEl, stepsEl, rollResult) {
    nameEl.textContent = rollResult.name;
    nameEl.classList.add('reveal');
    stepsEl.textContent = `${rollResult.steps}칸 이동`;
  }

  // Public: animate the yut throw; resolves after animation finishes.
  function show(rollResult) {
    return new Promise(resolve => {
      const resultEl  = $('yut-result-display');
      const throwArea = $('yut-throw-area');
      const nameEl    = $('yut-name');
      const stepsEl   = $('yut-steps');
      if (!resultEl) { resolve(); return; }

      resetResultDom(resultEl, throwArea, nameEl, stepsEl);

      let maxEnd = 0;
      rollResult.sticks.forEach((stickVal, i) => {
        const params = stickFlightParams(stickVal === 1, i);
        maxEnd = Math.max(maxEnd, params.delay + params.duration);
        const { stick, inner } = makeStickEl();
        throwArea.appendChild(stick);
        animateStick(stick, inner, params);
      });

      setTimeout(() => {
        revealResult(nameEl, stepsEl, rollResult);
        setTimeout(resolve, 350);
      }, maxEnd + 200);
    });
  }

  return { show };
})();
