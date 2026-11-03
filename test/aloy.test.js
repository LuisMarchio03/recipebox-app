const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

/** O link que abre a ALOY no celular já na receita (aloy-brain, docs/adr/0012). */
describe('ALOY', () => {
  test('o link leva o título codificado', async () => {
    const { aloyLink } = await import('../public/js/lib/aloy.js');
    assert.equal(aloyLink('Pão & Queijo'), 'aloy://receita?nome=P%C3%A3o%20%26%20Queijo');
  });

  test('o botão só aparece no Android, onde a ALOY existe', async () => {
    const { hasAloy } = await import('../public/js/lib/aloy.js');
    assert.equal(hasAloy('Mozilla/5.0 (Linux; Android 16; SM-S921B) Chrome/140'), true);
    assert.equal(hasAloy('Mozilla/5.0 (X11; Linux x86_64) Firefox/140'), false);
    assert.equal(hasAloy('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)'), false);
  });
});
