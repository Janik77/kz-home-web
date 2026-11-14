import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from '../../app/theme-context';
import { PageHeading } from '../../components/ui/page-heading';
import { useRuntime } from '../../app/runtime-context';
import { Button } from '../../components/ui/button';
import { useNavigate } from 'react-router';

const options = [
  { value: 'light', label: 'Светлая', description: 'Светлое пространство.', icon: Sun },
  { value: 'dark', label: 'Тёмная', description: 'Спокойный вечерний вид.', icon: Moon },
  { value: 'system', label: 'Системная', description: 'Как на вашем устройстве.', icon: Monitor },
] as const;

export function SettingsPage() {
  const theme = useTheme();
  const runtime = useRuntime();
  const navigate = useNavigate();
  return <div className="page everyday-page settings-page"><PageHeading eyebrow="ПАРАМЕТРЫ" title="Настройки" description={runtime.mode === 'core' ? 'Оформление, учётная запись и подключённый дом.' : 'Оформление и информация о демонстрации.'} />
    <fieldset className="settings-panel"><legend>Внешний вид</legend><p>Выберите комфортное оформление.</p><div className="theme-options">
      {options.map(({ value, label, description, icon: Icon }) => <label className="theme-option" key={value}>
        <input type="radio" name="theme" value={value} checked={theme.preference === value} onChange={() => theme.setPreference(value)} /><span className={`theme-preview theme-preview--${value}`} aria-hidden="true"><i /><i /><i /></span><Icon size={19} aria-hidden="true" /><strong>{label}</strong><span>{description}</span>
      </label>)}
    </div></fieldset>
    {runtime.mode === 'core' ? <section className="settings-panel" aria-labelledby="account-heading"><h2 id="account-heading">Учётная запись и подключение</h2><p className="account-email">Вы вошли как {runtime.user.email}</p>
      <label className="house-selector">Дом<select value={runtime.houseId} onChange={(event) => { navigate('/'); runtime.selectHouse(event.target.value); }}>{runtime.houses.map((house) => <option key={house.id} value={house.id}>{house.name}</option>)}</select></label>
      <details className="diagnostics"><summary>Подключение и диагностика</summary><p>Core показывает полученные состояния. Управление поддерживаемыми реле требует прав на управление и чтение; сервер проверяет допуск команды. Для программных реле доступны явные пошаговые запуски сцен с проверкой результата. Шторы, диммеры и другие команды из Web не поддерживаются. Обновляйте данные вручную.</p><p>Сеанс хранится в памяти вкладки. После перезагрузки войдите снова. В браузере сохраняется только тема.</p></details>
      <Button variant="secondary" onClick={runtime.logout}>Выйти</Button><div className="version-label">KZ Home <span>Web</span></div></section>
      : <section className="settings-panel" aria-labelledby="about-preview"><h2 id="about-preview">О демо-режиме</h2><p>Вы просматриваете пример дома. Управление и сценарии изменяют только демонстрационные данные. Перезагрузка сбрасывает изменения.</p><p>В браузере сохраняется только тема. Для входа в настоящий дом выберите режим Core в локальной конфигурации.</p><div className="version-label">KZ Home <span>Web</span></div></section>}
  </div>;
}
