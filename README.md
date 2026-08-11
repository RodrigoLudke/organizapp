# OrganizApp 📚

App local-first de organização pessoal — ideias, notas e lembretes.
Tudo fica **no seu aparelho** (banco SQLite), sem servidor, sem login, funciona offline.

- **Expo SDK 57** · React Native 0.86 · React 19.2 · TypeScript
- Armazenamento: `expo-sqlite` (async)
- Lembretes: `expo-notifications` (notificação local agendada)
- Navegação: `expo-router` (rotas por arquivo)

## Pré-requisitos

- **Node.js 22.13 ou mais novo** (obrigatório no SDK 57)
- Para gerar o APK: **Java JDK 17** e **Android Studio** (SDK + emulador), OU uma conta Expo para usar o EAS Build na nuvem.

## 1. Instalar

```bash
cd organizapp
npm install
# alinha todas as libs à versão exata do SDK 57:
npx expo install --fix
npx expo-doctor@latest
```

## 2. Rodar em desenvolvimento

As notificações **não funcionam no Expo Go** — você precisa de um *development build*.

```bash
# gera as pastas nativas (no SDK 57 o prebuild limpa por padrão)
npx expo prebuild
# instala e roda no emulador/aparelho conectado:
npx expo run:android
```

## 3. Gerar o APK

### Opção A — Local (não precisa de conta)

```bash
npx expo prebuild --platform android
cd android
./gradlew assembleRelease
```

O APK sai em:
`android/app/build/outputs/apk/release/app-release.apk`

> Para instalar em qualquer celular sem publicar na loja, esse APK já serve.
> É gerado com uma chave de debug/assinatura padrão; para publicar na Play Store
> você precisa configurar uma keystore própria.

### Opção B — EAS Build (na nuvem, recomendado)

```bash
npm install -g eas-cli
eas login
eas build:configure
eas build -p android --profile preview   # gera um APK instalável
```

Ao terminar, o EAS te dá um link para baixar o APK.

## Estrutura

```
app/
  _layout.tsx     # inicializa o banco + notificações e a navegação
  index.tsx       # lista, busca e filtros
  edit.tsx        # criar / editar / excluir
src/
  db/database.ts       # SQLite: tabelas e queries
  lib/notifications.ts # agendar/cancelar lembretes
  components/ItemCard.tsx
  theme.ts             # cores e metadados dos tipos
```

## Personalizar

- Cores: `src/theme.ts`
- Nome/ícone do app e `package` do Android: `app.json`
  (troque `com.seunome.organizapp` pelo seu domínio invertido)

## Ideias para evoluir

- Tags/categorias e filtro por tag
- Lembretes que se repetem (diário/semanal)
- Exportar/importar como JSON (backup manual, mantendo local-first)
- Sincronização opcional entre aparelhos
