import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ENTRY_TYPES,
  SYMPTOM_TYPES,
  type EntryDto,
  type EntryInput,
  type EntryType,
  type IngredientDto,
  type SymptomType,
  type TemplateDto,
  utcToWallTime,
} from '@foodlog/shared';
import {
  useCreateEntry,
  useCreateTemplate,
  useDeleteTemplate,
  useTemplates,
  useUpdateEntry,
} from '../api/hooks.ts';
import { IngredientPicker } from './IngredientPicker.tsx';
import { Button, Card, ErrorMessage, Field } from './ui.tsx';

const TEMPLATE_TYPES: EntryType[] = ['meal', 'drink', 'medication'];

export function EntryForm({
  initial,
  type: initialType,
  defaultTime,
  timeZone,
  onDone,
}: {
  initial?: EntryDto;
  type: EntryType;
  defaultTime: string;
  timeZone: string;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const create = useCreateEntry();
  const update = useUpdateEntry();
  const createTemplate = useCreateTemplate();
  const deleteTemplate = useDeleteTemplate();
  const templates = useTemplates();

  const [type, setType] = useState<EntryType>(initial?.type ?? initialType);
  const [time, setTime] = useState(
    initial ? utcToWallTime(new Date(initial.occurredAt), timeZone) : defaultTime,
  );
  const [title, setTitle] = useState(initial?.title ?? '');
  const [ingredients, setIngredients] = useState<IngredientDto[]>(initial?.ingredients ?? []);
  const [symptomType, setSymptomType] = useState<SymptomType>(initial?.symptomType ?? 'bloating');
  const [severity, setSeverity] = useState(initial?.severity ?? 3);
  const [bristol, setBristol] = useState(initial?.bristol ?? 4);
  const [note, setNote] = useState(initial?.note ?? '');
  const [saveTemplate, setSaveTemplate] = useState(false);
  const [templateName, setTemplateName] = useState('');

  const mutation = initial ? update : create;
  const canTemplate = TEMPLATE_TYPES.includes(type);
  const isFood = type === 'meal' || type === 'drink';

  const buildInput = (): EntryInput => {
    const base = { occurredAt: time, note: note.trim() || null };
    switch (type) {
      case 'meal':
      case 'drink':
        return {
          ...base,
          type,
          title: title.trim() || null,
          ingredientIds: ingredients.map((ingredient) => ingredient.id),
        };
      case 'symptom':
        return { ...base, type, symptomType, severity };
      case 'stool':
        return { ...base, type, bristol };
      case 'medication':
        return { ...base, type, title: title.trim() };
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const body = buildInput();
    try {
      if (initial) await update.mutateAsync({ id: initial.id, body });
      else await create.mutateAsync(body);
      if (saveTemplate && canTemplate && templateName.trim()) {
        await createTemplate.mutateAsync({
          name: templateName.trim(),
          type: type as TemplateDto['type'],
          title: title.trim() || null,
          ingredientIds: ingredients.map((ingredient) => ingredient.id),
        });
      }
      onDone();
    } catch {
      return;
    }
  };

  const applyTemplate = (template: TemplateDto) => {
    setTitle(template.title ?? '');
    setIngredients(template.ingredients);
  };

  const matchingTemplates = (templates.data ?? []).filter((template) => template.type === type);
  const error = mutation.error ?? createTemplate.error;

  return (
    <Card>
      <form onSubmit={submit} className="space-y-4" aria-label={t('tracking.addEntry')}>
        <ErrorMessage error={error} />
        <div role="group" aria-label={t('tracking.addEntry')} className="flex flex-wrap gap-2">
          {ENTRY_TYPES.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={type === value}
              onClick={() => setType(value)}
              className="rounded-full border border-fg/20 px-3 py-1 text-sm font-medium aria-pressed:border-brand aria-pressed:bg-brand aria-pressed:text-cream"
            >
              {t(`tracking.types.${value}`)}
            </button>
          ))}
        </div>

        <Field
          label={t('tracking.time')}
          type="datetime-local"
          required
          value={time}
          onChange={(event) => setTime(event.target.value)}
        />

        {canTemplate && matchingTemplates.length > 0 && (
          <div className="space-y-1">
            <p className="text-sm font-medium">{t('tracking.templates')}</p>
            <ul className="flex flex-wrap gap-2">
              {matchingTemplates.map((template) => (
                <li
                  key={template.id}
                  className="flex items-center rounded-full border border-fg/20 text-sm"
                >
                  <button
                    type="button"
                    aria-label={t('tracking.useTemplate', { name: template.name })}
                    onClick={() => applyTemplate(template)}
                    className="rounded-l-full py-1 pl-3 pr-2 hover:bg-fg/5"
                  >
                    {template.name}
                  </button>
                  <button
                    type="button"
                    aria-label={t('tracking.deleteTemplate', { name: template.name })}
                    onClick={() => deleteTemplate.mutate(template.id)}
                    className="rounded-r-full py-1 pl-1 pr-2 hover:bg-fg/5"
                  >
                    <span aria-hidden="true">×</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {(isFood || type === 'medication') && (
          <Field
            label={
              type === 'medication' ? t('tracking.medicationName') : t('tracking.titleOptional')
            }
            required={type === 'medication'}
            maxLength={120}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        )}

        {isFood && <IngredientPicker selected={ingredients} onChange={setIngredients} />}

        {type === 'symptom' && (
          <>
            <label className="block space-y-1">
              <span className="text-sm font-medium">{t('tracking.symptomType')}</span>
              <select
                value={symptomType}
                onChange={(event) => setSymptomType(event.target.value as SymptomType)}
                className="w-full rounded-lg border border-fg/20 bg-raised px-3 py-2"
              >
                {SYMPTOM_TYPES.map((value) => (
                  <option key={value} value={value}>
                    {t(`tracking.symptoms.${value}`)}
                  </option>
                ))}
              </select>
            </label>
            <div className="space-y-1">
              <label htmlFor="severity" className="block text-sm font-medium">
                {t('tracking.severity')}
              </label>
              <input
                id="severity"
                type="range"
                min={0}
                max={10}
                step={1}
                value={severity}
                aria-valuetext={t('tracking.severityValue', { value: severity })}
                onChange={(event) => setSeverity(Number(event.target.value))}
                className="w-full accent-brand"
              />
              <p className="text-sm text-fg/75">
                {t('tracking.severityValue', { value: severity })}
              </p>
            </div>
          </>
        )}

        {type === 'stool' && (
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">{t('tracking.bristol')}</legend>
            {[1, 2, 3, 4, 5, 6, 7].map((value) => (
              <label
                key={value}
                className="flex cursor-pointer items-start gap-3 rounded-lg border border-fg/10 px-3 py-2 has-[:checked]:border-brand has-[:checked]:bg-accent/10"
              >
                <input
                  type="radio"
                  name="bristol"
                  value={value}
                  checked={bristol === value}
                  onChange={() => setBristol(value)}
                  className="mt-1"
                />
                <span className="text-sm">
                  <span className="font-medium">{t('tracking.bristolType', { value })}</span>
                  {': '}
                  {t(`tracking.bristolDescriptions.${value}`)}
                </span>
              </label>
            ))}
          </fieldset>
        )}

        <label className="block space-y-1">
          <span className="text-sm font-medium">{t('tracking.note')}</span>
          <textarea
            rows={2}
            maxLength={1000}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            className="w-full rounded-lg border border-fg/20 bg-raised px-3 py-2 outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
          />
        </label>

        {canTemplate && !initial && (
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={saveTemplate}
                onChange={(event) => setSaveTemplate(event.target.checked)}
              />
              {t('tracking.saveAsTemplate')}
            </label>
            {saveTemplate && (
              <Field
                label={t('tracking.templateName')}
                required
                maxLength={80}
                value={templateName}
                onChange={(event) => setTemplateName(event.target.value)}
              />
            )}
          </div>
        )}

        <div className="flex gap-3">
          <Button type="submit" disabled={mutation.isPending}>
            {t('tracking.save')}
          </Button>
          <Button type="button" variant="secondary" onClick={onDone}>
            {t('tracking.cancel')}
          </Button>
        </div>
      </form>
    </Card>
  );
}
