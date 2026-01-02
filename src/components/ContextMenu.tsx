import { useEffect, useRef } from 'react';
import './ContextMenu.css';

interface ContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  items: { label: string; onClick: () => void }[];
}

export const ContextMenu = ({ x, y, onClose, items }: ContextMenuProps) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as any)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  return (
    <div 
        ref={ref}
        className="context-menu"
        style={{ top: y, left: x }}
    >
        {items.map((item, index) => (
            <button key={index} className="context-menu-item" onClick={() => {
                item.onClick();
                onClose();
            }}>
                {item.label}
            </button>
        ))}
    </div>
  );
};
