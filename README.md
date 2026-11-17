# Calcula Aí

Correção de aportes feitos em datas diferentes até uma data comum, por **IPCA**, **CDI** ou **taxa fixa**.
Também aceita **retiradas** (ex.: parcelas pagas com o próprio saldo): o dinheiro continua rendendo até cada
retirada, e o resultado mostra quanto sobra ou falta depois da última.

- IPCA + spread (% a.a.), percentual do CDI, ou taxa fixa ao mês/ao ano
- Capitalização mensal com pro rata die dentro do mês
- Data-alvo padrão = hoje (pode ser fixada em outra data)
- Meses sem índice publicado usam taxa estimada (média dos últimos 12 meses, ou valor informado)
- Gráfico com total (barras), juros e aportes acumulados (linhas), projeção futura em cinza; cada série pode ser ligada/desligada
- Cálculos salvos no navegador (localStorage), com exportar/importar JSON
- Relatório em PDF (parâmetros, resumo, gráfico e tabelas)
- Consulta do saldo em qualquer data (digitando ou clicando no gráfico)
- Retiradas acompanham a data de início quando ela muda (opcional)

Os índices vêm da API SGS do Banco Central (433 — IPCA, 4391 — CDI mensal), consultada direto do navegador.
`src/data/rates-snapshot.json` é o fallback offline; para atualizá-lo:

```bash
npm run update-rates
```

## Desenvolvimento

```bash
npm install
npm run dev     # http://localhost:5173
npm test        # testes do motor de cálculo
npm run build   # gera dist/ (site estático)
```
