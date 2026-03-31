document.getElementById('formatBtn').addEventListener('click', function() {
  const input = document.getElementById('jsonInput').value;
  const output = document.getElementById('output');
  try {
    const obj = JSON.parse(input);
    output.textContent = JSON.stringify(obj, null, 2);
    output.style.color = 'black';
  } catch (e) {
    output.textContent = 'Invalid JSON';
    output.style.color = 'red';
  }
});
