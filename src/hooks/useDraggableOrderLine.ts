import { useState, useCallback, useRef, useEffect } from 'react';

export interface CoordinateConverter {
  priceToCoordinate: (price: number) => number;
  coordinateToPrice: (y: number) => number;
}

export interface DragEventPayload {
  clientY: number;
  button?: number;
  clientX?: number;
  preventDefault?: () => void;
  stopPropagation?: () => void;
}

export interface DragUpdateResult {
  orderId: string;
  lineType: 'STOP_LOSS' | 'TAKE_PROFIT' | string;
  previousPrice: number;
  newPrice: number;
}

export interface DraggableOrderLineSession {
  isDragging(): boolean;
  getCurrentPrice(): number;
  getCurrentCoordinateY(): number;
  handleMouseDown(event: DragEventPayload): boolean;
  handleMouseMove(event: DragEventPayload): void;
  handleMouseUp(event: DragEventPayload): void;
  cancelDrag(): void;
}

export interface CreateDraggableOrderLineSessionOptions {
  orderId: string;
  lineType: 'STOP_LOSS' | 'TAKE_PROFIT' | string;
  initialPrice: number;
  tickSize?: number;
  minPriceLimit?: number;
  maxPriceLimit?: number;
  hitZoneHeight?: number;
  converter: CoordinateConverter;
  onCommitPrice?: (result: DragUpdateResult) => void;
}

function getPrecision(tickSize: number): number {
  const tickStr = tickSize.toString();
  if (tickStr.includes('e-')) {
    const [, exp] = tickStr.split('e-');
    return parseInt(exp, 10);
  }
  const decimalPart = tickStr.split('.')[1];
  return decimalPart ? decimalPart.length : 0;
}

function quantizePrice(price: number, tickSize: number): number {
  if (!tickSize || tickSize <= 0) return price;
  const steps = Math.round(price / tickSize);
  const quantized = steps * tickSize;
  const precision = getPrecision(tickSize);
  return Number(quantized.toFixed(precision));
}

export function createDraggableOrderLineSession(
  options: CreateDraggableOrderLineSessionOptions
): DraggableOrderLineSession {
  const {
    orderId,
    lineType,
    tickSize = 1,
    minPriceLimit,
    maxPriceLimit,
    converter,
    onCommitPrice,
  } = options;

  let initialPrice = options.initialPrice;
  let currentPrice = options.initialPrice;
  let dragging = false;

  const effectiveMin =
    minPriceLimit !== undefined && maxPriceLimit !== undefined
      ? Math.min(minPriceLimit, maxPriceLimit)
      : minPriceLimit;
  const effectiveMax =
    minPriceLimit !== undefined && maxPriceLimit !== undefined
      ? Math.max(minPriceLimit, maxPriceLimit)
      : maxPriceLimit;

  function calculatePriceFromY(clientY: number): number {
    const rawPrice = converter.coordinateToPrice(clientY);
    let price = rawPrice;

    if (effectiveMin !== undefined && price < effectiveMin) {
      price = effectiveMin;
    }
    if (effectiveMax !== undefined && price > effectiveMax) {
      price = effectiveMax;
    }

    if (tickSize !== undefined && tickSize > 0) {
      price = quantizePrice(price, tickSize);
    }

    if (effectiveMin !== undefined && price < effectiveMin) {
      price = effectiveMin;
    }
    if (effectiveMax !== undefined && price > effectiveMax) {
      price = effectiveMax;
    }

    return price;
  }

  return {
    isDragging(): boolean {
      return dragging;
    },

    getCurrentPrice(): number {
      return currentPrice;
    },

    getCurrentCoordinateY(): number {
      return converter.priceToCoordinate(currentPrice);
    },

    handleMouseDown(event: DragEventPayload): boolean {
      if (event.button !== undefined && event.button !== 0) {
        return false;
      }
      dragging = true;
      return true;
    },

    handleMouseMove(event: DragEventPayload): void {
      if (!dragging) return;
      currentPrice = calculatePriceFromY(event.clientY);
    },

    handleMouseUp(event: DragEventPayload): void {
      if (!dragging) return;
      if (event.clientY !== undefined) {
        currentPrice = calculatePriceFromY(event.clientY);
      }
      dragging = false;
      const previousPrice = initialPrice;
      const newPrice = currentPrice;
      initialPrice = newPrice;
      onCommitPrice?.({
        orderId,
        lineType,
        previousPrice,
        newPrice,
      });
    },

    cancelDrag(): void {
      if (!dragging) return;
      dragging = false;
      currentPrice = initialPrice;
    },
  };
}

export function useDraggableOrderLine(options: CreateDraggableOrderLineSessionOptions) {
  const [isDragging, setIsDragging] = useState(false);
  const [currentPrice, setCurrentPrice] = useState(options.initialPrice);
  const sessionRef = useRef<DraggableOrderLineSession | null>(null);

  useEffect(() => {
    setCurrentPrice(options.initialPrice);
  }, [options.initialPrice]);

  const getOrCreateSession = useCallback(() => {
    if (!sessionRef.current) {
      sessionRef.current = createDraggableOrderLineSession({
        ...options,
        onCommitPrice: (result) => {
          setIsDragging(false);
          options.onCommitPrice?.(result);
        },
      });
    }
    return sessionRef.current;
  }, [options]);

  const handleMouseDown = useCallback(
    (event: DragEventPayload) => {
      const session = getOrCreateSession();
      const started = session.handleMouseDown(event);
      if (started) {
        setIsDragging(true);
      }
      return started;
    },
    [getOrCreateSession]
  );

  const handleMouseMove = useCallback(
    (event: DragEventPayload) => {
      if (sessionRef.current && isDragging) {
        sessionRef.current.handleMouseMove(event);
        setCurrentPrice(sessionRef.current.getCurrentPrice());
      }
    },
    [isDragging]
  );

  const handleMouseUp = useCallback(
    (event: DragEventPayload) => {
      if (sessionRef.current && isDragging) {
        sessionRef.current.handleMouseUp(event);
        setIsDragging(false);
      }
    },
    [isDragging]
  );

  const cancelDrag = useCallback(() => {
    if (sessionRef.current && isDragging) {
      sessionRef.current.cancelDrag();
      setIsDragging(false);
      setCurrentPrice(sessionRef.current.getCurrentPrice());
    }
  }, [isDragging]);

  const currentCoordinateY = sessionRef.current
    ? sessionRef.current.getCurrentCoordinateY()
    : options.converter.priceToCoordinate(currentPrice);

  return {
    isDragging,
    currentPrice,
    currentCoordinateY,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    cancelDrag,
  };
}