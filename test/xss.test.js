const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

/**
 * O XSS armazenado original: o app montava
 *
 *   onclick="handleShare('${escapeHtml(r.title)}', ...)"
 *
 * e o escapeHtml de então (textContent -> innerHTML) escapava `& < >` mas não
 * aspas. Um título como  '); alert(1); //  fechava a string JS e executava
 * código no navegador de qualquer membro do grupo que abrisse a receita.
 *
 * A correção tem duas camadas, e os testes cobrem as duas.
 */

describe('XSS', () => {
  test('escapeHtml neutraliza aspas, não só os sinais de maior/menor', async () => {
    const { escapeHtml } = await import('../public/js/ui.js');

    // Esta é a carga que quebrava o app antigo.
    const payload = "'); alert(1); //";
    const escaped = escapeHtml(payload);

    assert.ok(!escaped.includes("'"), 'a aspa simples precisa ser escapada');
    assert.equal(escaped, '&#39;); alert(1); //');

    assert.equal(escapeHtml('<script>'), '&lt;script&gt;');
    assert.equal(escapeHtml('a "b" c'), 'a &quot;b&quot; c');
    assert.equal(escapeHtml('`crase`'), '&#96;crase&#96;');
    assert.equal(escapeHtml('a & b'), 'a &amp; b');
  });

  test('o escape acontece antes da interpolação, não depois', async () => {
    const { escapeHtml } = await import('../public/js/ui.js');

    // Se o escape rodasse duas vezes, "&" viraria "&amp;amp;" e o texto do
    // usuário apareceria corrompido na tela.
    assert.equal(escapeHtml(escapeHtml('&')), '&amp;amp;');
    assert.equal(escapeHtml('&'), '&amp;');
  });

  test('nenhum manipulador de evento inline sobrou no código do front', () => {
    // A defesa de fundo não é escapar melhor, é não colocar dado do usuário
    // dentro de um atributo que o navegador executa como código. Se alguém
    // reintroduzir um `onclick=`, este teste avisa.
    const dirs = ['public/js', 'public/js/pages', 'public/js/lib'];
    const offenders = [];

    for (const dir of dirs) {
      const full = path.join(__dirname, '..', dir);
      if (!fs.existsSync(full)) continue;

      for (const file of fs.readdirSync(full)) {
        if (!file.endsWith('.js')) continue;
        const source = fs.readFileSync(path.join(full, file), 'utf8');
        // Procura `onclick=`, `onerror=`, etc. dentro de strings de template.
        if (/\son(?:click|error|load|mouseover|focus|submit)\s*=\s*["'`]/i.test(source)) {
          offenders.push(`${dir}/${file}`);
        }
      }
    }

    assert.deepEqual(offenders, [], 'use data-action + registerActions em vez de onclick inline');
  });

  test('o index.html também não tem manipuladores inline', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
    assert.ok(
      !/\son(?:click|error|load|submit)\s*=/i.test(html),
      'a CSP bloqueia scripts inline; um onclick no HTML simplesmente não funcionaria'
    );
  });
});
