// A ALOY é a assistente de voz do celular: o link abre o app dela já com esta receita.

export const aloyLink = title => `aloy://receita?nome=${encodeURIComponent(title)}`;

export const hasAloy = (userAgent = navigator.userAgent) => /Android/.test(userAgent);
