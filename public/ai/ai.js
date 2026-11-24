(() => {
  const form = document.getElementById('ai-question-form');
  const input = document.getElementById('ai-question-input');
  const charCountEl = document.getElementById('ai-char-count');
  const submitBtn = document.getElementById('ai-submit-btn');
  const loadingEl = document.getElementById('ai-loading');
  const errorEl = document.getElementById('ai-error');
  const answerSectionEl = document.getElementById('ai-answer-section');
  const answerTextEl = document.getElementById('ai-answer-text');

  if (!form || !input || !submitBtn || !loadingEl || !errorEl || !answerSectionEl || !answerTextEl) {
    return;
  }

  const maxLength = Number(form.dataset.maxLength) || 1000;
  let isSubmitting = false;

  function updateCharCount() {
    const currentLength = input.value.length;
    const isOver = currentLength > maxLength;
    if (charCountEl) {
      charCountEl.textContent = `${currentLength.toLocaleString()} / ${maxLength.toLocaleString()}文字`;
      charCountEl.classList.toggle('is-over', isOver);
    }
  }

  function setLoadingState(loading) {
    isSubmitting = loading;
    input.disabled = loading;
    submitBtn.disabled = loading;
    submitBtn.textContent = loading ? '回答生成中...' : '質問する';
    loadingEl.hidden = !loading;

    if (loading) {
      errorEl.hidden = true;
      errorEl.textContent = '';
    }
  }

  function showError(message) {
    errorEl.textContent = message;
    errorEl.hidden = false;
  }

  function showAnswer(answer) {
    answerTextEl.textContent = answer;
    answerSectionEl.hidden = false;
  }

  input.addEventListener('input', updateCharCount);
  updateCharCount();

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (isSubmitting) {
      return;
    }

    const rawQuestion = input.value;
    const trimmedQuestion = rawQuestion.trim();

    if (trimmedQuestion.length === 0) {
      showError('質問を入力してください。');
      input.focus();
      return;
    }

    if (rawQuestion.length > maxLength) {
      showError(`質問は${maxLength.toLocaleString()}文字以内で入力してください。`);
      input.focus();
      return;
    }

    setLoadingState(true);

    try {
      const response = await fetch('/ai/ask', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ question: rawQuestion }),
      });

      let data = null;
      try {
        data = await response.json();
      } catch {
        data = null;
      }

      if (!response.ok) {
        const message =
          data?.error?.message ||
          '回答の取得中にエラーが発生しました。時間をおいて再度お試しください。';
        showError(message);
        return;
      }

      if (!data || typeof data.answer !== 'string' || data.answer.trim().length === 0) {
        showError('AIから有効な回答を取得できませんでした。');
        return;
      }

      showAnswer(data.answer);
    } catch {
      showError('通信エラーが発生しました。ネットワーク接続を確認してください。');
    } finally {
      setLoadingState(false);
      input.focus();
    }
  });
})();