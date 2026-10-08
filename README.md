# Easygra

## Wspólny ranking, czat i alerty

Strona działa na GitHub Pages. Profil lokalny i gry działają bez konfiguracji; wspólny ranking, czat oraz powiadomienia o wygranych powyżej 1000 pkt wymagają projektu Supabase.

1. Utwórz bezpłatny projekt w Supabase.
2. W Authentication włącz logowanie anonimowe (Anonymous Sign-Ins).
3. W SQL Editor uruchom zawartość `supabase-schema.sql`.
4. W ustawieniach API skopiuj Project URL i publiczny klucz `anon` / `publishable`.
5. Wpisz te wartości do `community-config.js`:

```js
window.GRAJOWNIA_SUPABASE_CONFIG = {
	url: 'https://TWOJ-PROJEKT.supabase.co',
	anonKey: 'TWOJ_PUBLICZNY_KLUCZ_ANON',
};
```

Następnie wypchnij zmianę na `main`; GitHub Actions zaktualizuje stronę. Nie umieszczaj klucza `service_role` w kodzie strony. Publiczne profile, czat i powiadomienia są demonstracyjne: ranking opiera się na punktach z przeglądarki, więc nie jest odporny na celowe manipulacje.