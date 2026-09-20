import type { SymbolSearchResult } from '../hooks/useSymbolSearch.js';

export interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectSymbol: (symbol: string) => void;
  query?: string;
  results?: SymbolSearchResult[];
  isLoading?: boolean;
  onQueryChange?: (query: string) => void;
}

export interface PaletteStateContext {
  isOpen: boolean;
  setOpen: (open: boolean) => void;
}

export function handlePaletteKeyDown(
  event: {
    key: string;
    metaKey?: boolean;
    ctrlKey?: boolean;
    preventDefault: () => void;
    stopPropagation?: () => void;
  },
  context: PaletteStateContext
): void {
  const isK = event.key?.toLowerCase() === 'k';
  if ((event.metaKey || event.ctrlKey) && isK) {
    event.preventDefault();
    event.stopPropagation?.();
    context.setOpen(true);
    return;
  }

  if (event.key === 'Escape' && context.isOpen) {
    event.preventDefault();
    event.stopPropagation?.();
    context.setOpen(false);
    return;
  }
}

export class CommandPalette {
  public props: CommandPaletteProps;

  constructor(props: CommandPaletteProps) {
    this.props = props;
  }

  public selectItem = (symbol: SymbolSearchResult | string): void => {
    const symbolStr = typeof symbol === 'string' ? symbol : symbol.symbol;
    this.props.onSelectSymbol(symbolStr);
    this.props.onClose();
  };

  public render(): unknown {
    if (!this.props.isOpen) {
      return null;
    }
    return {
      isOpen: this.props.isOpen,
      query: this.props.query,
      results: this.props.results,
      isLoading: this.props.isLoading,
    };
  }
}

export default CommandPalette;