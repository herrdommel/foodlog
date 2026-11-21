import { useTranslation } from 'react-i18next';
import type { LegalDoc } from '@foodlog/shared';
import { useLegalDocument } from '../api/hooks.ts';
import { PublicLayout } from '../components/Layout.tsx';
import { Markdown } from '../components/Markdown.tsx';
import { ErrorMessage, Notice } from '../components/ui.tsx';

export function LegalPage({ doc }: { doc: LegalDoc }) {
  const { t, i18n } = useTranslation();
  const language = i18n.language === 'de' ? 'de' : 'en';
  const document = useLegalDocument(doc, language);
  const data = document.data;

  return (
    <PublicLayout wide>
      {document.isPending && <p className="text-fg/75">{t('legal.loading')}</p>}
      {document.error && <ErrorMessage error={document.error} />}
      {data && (
        <>
          {data.language !== language && (
            <Notice>{t(data.language === 'de' ? 'legal.onlyGerman' : 'legal.onlyEnglish')}</Notice>
          )}
          {!/^\s*#\s+\S/m.test(data.markdown) && <h1 className="sr-only">{t(`legal.${doc}`)}</h1>}
          <article className="mt-4">
            <Markdown source={data.markdown} />
          </article>
        </>
      )}
    </PublicLayout>
  );
}
