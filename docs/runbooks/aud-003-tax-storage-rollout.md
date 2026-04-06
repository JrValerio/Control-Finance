# AUD-003 Rollout - Tax Document Storage Remote

## Objetivo

Remover dependencia de filesystem local para escrita de novos documentos fiscais em producao, usando backend remoto S3 compativel.

## Politica operacional

1. Em `NODE_ENV=production`, o adapter obrigatorio e `s3`.
2. Escrita nova de documentos fiscais usa apenas backend remoto.
3. Leitura e `remote-first`.
4. Leitura de legado local so e permitida de forma temporaria e explicita com:
   - `TAX_DOCUMENTS_LEGACY_LOCAL_READ_ENABLED=true`
   - `TAX_DOCUMENTS_LEGACY_LOCAL_STORAGE_DIR=<dir-legado>`
5. Sem configuracao remota valida em producao, o bootstrap falha.

## Configuracao minima (producao)

- `TAX_DOCUMENTS_STORAGE_ADAPTER=s3`
- `TAX_DOCUMENTS_REMOTE_BUCKET=<bucket>`
- `TAX_DOCUMENTS_REMOTE_REGION=<region>`

## Opcional

- `TAX_DOCUMENTS_REMOTE_ENDPOINT=<endpoint-s3-compativel>`
- `TAX_DOCUMENTS_REMOTE_FORCE_PATH_STYLE=true|false`
- `TAX_DOCUMENTS_REMOTE_ACCESS_KEY_ID=<key>`
- `TAX_DOCUMENTS_REMOTE_SECRET_ACCESS_KEY=<secret>`
- `TAX_DOCUMENTS_REMOTE_SESSION_TOKEN=<token>`

## Janela de compatibilidade de legado

Se documentos historicos permanecerem no local:

- habilitar `TAX_DOCUMENTS_LEGACY_LOCAL_READ_ENABLED=true`
- definir `TAX_DOCUMENTS_LEGACY_LOCAL_STORAGE_DIR`
- planejar migracao de objetos legados para backend remoto
- desabilitar a flag apos encerramento da janela

## Rollback

Rollback em producao deve ser controlado e explicito (nao silencioso):

1. Corrigir configuracao remota invalida e redeploy.
2. Se necessario, ativar temporariamente leitura de legado local apenas para recuperacao controlada.
3. Nao usar fallback silencioso para escrita local em producao.
