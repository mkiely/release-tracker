import { Icon } from './Icon';
import styles from './SearchBox.module.css';

/** The quick-search field shared by the card and table filter bars. Esc clears it
 *  rather than blurring, the way a native search input does. */
export function SearchBox({
  value,
  onChange,
  placeholder = 'Search key or title',
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className={styles.box}>
      <span className={styles.icon}>{Icon.search}</span>
      <input
        type="text"
        className={styles.input}
        value={value}
        placeholder={placeholder}
        aria-label="Search work items by key or title"
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && value !== '') {
            e.preventDefault();
            e.stopPropagation();
            onChange('');
          }
        }}
      />
      {value !== '' && (
        <button type="button" className={styles.clear} onClick={() => onChange('')} title="Clear search" aria-label="Clear search">
          {Icon.close}
        </button>
      )}
    </div>
  );
}
