---
title: "OIDC и OAuth 2.0"
description: "Контракт OIDC-провайдера Auth: code flow, токены, ротация refresh и revoke."
---

Auth обслуживает один настроенный confidential client. Discovery и JWKS публичны. Эндпоинты `token` и `revoke` требуют `client_secret_basic`.

## Последовательность действий

1. Клиент читает `/.well-known/openid-configuration` и `/oauth2/jwks`, затем направляет пользователя на `/oauth2/authorize` с точными `client_id` и `redirect_uri`, scope `openid profile email offline_access`, а также `state`, `nonce` и PKCE S256.
2. Auth принимает запрос только от активного пользователя с подтвержденным email и возвращает одноразовый короткоживущий authorization code.
3. `/oauth2/token` атомарно проверяет code, redirect URI и PKCE, создает session, привязанную к `client_id`, и выдает:
   - RS256 ID token с профилем, `nonce` и точными `iss`/`aud`;
   - EdDSA `access+jwt` только для Platform API;
   - opaque refresh token (в БД хранится только SHA-256 hash).
4. Refresh под `SELECT ... FOR UPDATE` ротирует session в той же `family_id` и возвращает новую пару access/refresh без ID token. Повторное использование уже замененного refresh token отзывает всю family.
5. `/oauth2/revoke` идемпотентно отзывает family, связанную с аутентифицированным клиентом.

Нативный `/auth/refresh` обслуживает только session без OAuth client binding. Platform API проверяет подпись, `alg`, `kid`, `typ`, точный `iss` и единственный ожидаемый audience; `client_id` попадает только в audit context, а права определяются по `sub`.

## Конфигурация и безопасность

OIDC включается только при полной группе `OIDC_*`: issuer и login URL, client ID/secret, точные redirect URI, RSA signing key, отдельные ключи AES-256 и HMAC. В production issuer, login и redirect URI должны быть на HTTPS; секреты предпочтительно передавать через файлы, доступные только сервисному пользователю.

Authorization code, access/refresh tokens, client secret и расшифрованные claims не логируются. Ответы protocol endpoints отдают `Cache-Control: no-store`; на стороне клиента redirects по умолчанию запрещены.

После успешной ротации клиент обязан атомарно сохранить новый refresh token. Если ответ потерян после ротации, старый token уже недействителен — интеграцию нужно подключить заново.
