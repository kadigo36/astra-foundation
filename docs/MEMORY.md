# ASTRA — Memória

## Implementação inicial v0.3

A memória está dividida em dois âmbitos:
- **Central:** preferências, objetivos, decisões e contexto transversal pertencentes ao utilizador.
- **Espaço:** informação estritamente associada a um espaço e visível apenas aos seus membros autorizados.

Cada entrada tem categoria, título, conteúdo, origem e estado (`confirmed` ou `proposed`). O estado `proposed` permite guardar uma sugestão sem a tratar como conhecimento confirmado.

## API disponível

- `POST /api/memory` — criar entrada.
- `GET /api/memory` — listar entradas próprias; filtros por âmbito, espaço e categoria.
- `GET /api/memory/{id}` — consultar entrada.
- `PATCH /api/memory/{id}` — atualizar e criar snapshot da versão anterior.
- `DELETE /api/memory/{id}` — apagar entrada e snapshots associados; mantém evento de auditoria sem o conteúdo.
- `GET /api/memory/{id}/revisions` — consultar histórico enquanto a entrada existir.
- `GET /api/memory/{id}/export.md` — exportar entrada em Markdown.

Todos os endpoints exigem autenticação. Entradas de espaço validam membership. Um utilizador não consegue consultar entradas de outro utilizador nem atravessar espaços.

## Modelo híbrido

1. **Base de dados:** fonte de verdade para entradas, permissões e histórico.
2. **Markdown:** formato de exportação legível, portátil e versionável.
3. **Pesquisa semântica:** etapa futura; o índice será derivado e reconstruível, sem substituir as permissões da fonte de verdade.

## Espaços previstos

Escola, Programação, Negócios, Projetos Pessoais e Vida Pessoal. A criação de espaços é atualmente manual através da API. A partilha entre espaços não existe por defeito.

## Ciclo de aprendizagem futuro

- Identificar padrões e correções.
- Distinguir preferências permanentes de instruções temporárias.
- Propor alterações como `proposed`.
- Pedir confirmação antes de promover conhecimento importante a `confirmed`.
- Registar alterações e permitir correção, exportação e eliminação.

## Limitações conhecidas

A estrutura atual usa `Base.metadata.create_all` para desenvolvimento e não migra automaticamente bases de dados já existentes. Antes de produção, criar migrações Alembic, definir retenção/backup e implementar pesquisa semântica com filtragem por utilizador e espaço antes da recuperação de resultados.
