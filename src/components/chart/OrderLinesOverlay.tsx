import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  createDraggableOrderLineSession,
  type DraggableOrderLineSession,
  type DragUpdateResult,
} from '../../hooks/useDraggableOrderLine.js';

export interface CoordinateConverter {
  priceToCoordinate: (price: number) => number;
  coordinateToPrice: (y: number) => number;
}

export interface Order {
  id: string;
  symbol: string;
  side: 'BUY' | 'SELL' | string;
  entryPrice: number;
  stopLoss?: number;
  takeProfit?: number;
  status: string;
}

export type OrderLineType = 'STOP_LOSS' | 'TAKE_PROFIT';

export interface OrderLineOverlayModel {
  orderId: string;
  lineType: OrderLineType;
  price: number;
  coordinateY: number;
  isInteractive: boolean;
  color: string;
  hitZoneHeight: number;
  symbol?: string;
  side?: 'BUY' | 'SELL' | string;
  width?: number;
}

export const STOP_LOSS_COLOR = '#EF4444';
export const TAKE_PROFIT_COLOR = '#10B981';
export const DEFAULT_HIT_ZONE_HEIGHT = 12;

export function computeOrderLines(
  orders: Order[],
  converter: CoordinateConverter,
  width: number = 800
): OrderLineOverlayModel[] {
  if (!Array.isArray(orders)) {
    return [];
  }

  const lines: OrderLineOverlayModel[] = [];

  for (const order of orders) {
    if (order.status?.toUpperCase() !== 'OPEN') {
      continue;
    }

    if (order.stopLoss !== undefined && order.stopLoss !== null) {
      lines.push({
        orderId: order.id,
        lineType: 'STOP_LOSS',
        price: order.stopLoss,
        coordinateY: converter.priceToCoordinate(order.stopLoss),
        isInteractive: true,
        color: STOP_LOSS_COLOR,
        hitZoneHeight: DEFAULT_HIT_ZONE_HEIGHT,
        symbol: order.symbol,
        side: order.side,
        width,
      });
    }

    if (order.takeProfit !== undefined && order.takeProfit !== null) {
      lines.push({
        orderId: order.id,
        lineType: 'TAKE_PROFIT',
        price: order.takeProfit,
        coordinateY: converter.priceToCoordinate(order.takeProfit),
        isInteractive: true,
        color: TAKE_PROFIT_COLOR,
        hitZoneHeight: DEFAULT_HIT_ZONE_HEIGHT,
        symbol: order.symbol,
        side: order.side,
        width,
      });
    }
  }

  return lines;
}

export interface OrderLinesOverlayProps {
  orders: Order[];
  converter: CoordinateConverter;
  width?: number;
  height?: number;
  tickSize?: number;
  minPriceLimit?: number;
  maxPriceLimit?: number;
  onCommitPrice?: (result: DragUpdateResult) => void;
  className?: string;
}

interface InteractiveLineProps {
  line: OrderLineOverlayModel;
  converter: CoordinateConverter;
  width: number;
  tickSize?: number;
  minPriceLimit?: number;
  maxPriceLimit?: number;
  onCommitPrice?: (result: DragUpdateResult) => void;
}

const InteractiveLine: React.FC<InteractiveLineProps> = ({
  line,
  converter,
  width,
  tickSize,
  minPriceLimit,
  maxPriceLimit,
  onCommitPrice,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [previewY, setPreviewY] = useState(line.coordinateY);
  const [previewPrice, setPreviewPrice] = useState(line.price);
  const sessionRef = useRef<DraggableOrderLineSession | null>(null);

  useEffect(() => {
    if (!isDragging) {
      setPreviewY(line.coordinateY);
      setPreviewPrice(line.price);
    }
  }, [line.coordinateY, line.price, isDragging]);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();

      const session = createDraggableOrderLineSession({
        orderId: line.orderId,
        lineType: line.lineType,
        initialPrice: line.price,
        tickSize,
        minPriceLimit,
        maxPriceLimit,
        converter,
        onCommitPrice: (result) => {
          setIsDragging(false);
          onCommitPrice?.(result);
        },
      });

      sessionRef.current = session;
      const started = session.handleMouseDown({ clientY: e.clientY, button: e.button });
      if (!started) return;

      setIsDragging(true);

      const onMouseMove = (moveEvent: MouseEvent) => {
        session.handleMouseMove({ clientY: moveEvent.clientY, button: moveEvent.button });
        setPreviewPrice(session.getCurrentPrice());
        setPreviewY(session.getCurrentCoordinateY());
      };

      const onMouseUp = (upEvent: MouseEvent) => {
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
        window.removeEventListener('keydown', onKeyDown);
        session.handleMouseUp({ clientY: upEvent.clientY, button: upEvent.button });
        setIsDragging(false);
      };

      const onKeyDown = (keyEvent: KeyboardEvent) => {
        if (keyEvent.key === 'Escape') {
          window.removeEventListener('mousemove', onMouseMove);
          window.removeEventListener('mouseup', onMouseUp);
          window.removeEventListener('keydown', onKeyDown);
          session.cancelDrag();
          setIsDragging(false);
          setPreviewPrice(session.getCurrentPrice());
          setPreviewY(session.getCurrentCoordinateY());
        }
      };

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
      window.addEventListener('keydown', onKeyDown);
    },
    [line, converter, tickSize, minPriceLimit, maxPriceLimit, onCommitPrice]
  );

  const displayPrice = isDragging ? previewPrice : line.price;
  const displayY = isDragging ? previewY : line.coordinateY;
  const label = line.lineType === 'STOP_LOSS' ? `SL: ${displayPrice}` : `TP: ${displayPrice}`;

  return (
    <g className={`order-line-${line.lineType.toLowerCase()}`}>
      <rect
        x={0}
        y={displayY - line.hitZoneHeight / 2}
        width={width}
        height={line.hitZoneHeight}
        fill="transparent"
        style={{ cursor: 'ns-resize' }}
        onMouseDown={handleMouseDown}
      />
      <line
        x1={0}
        y1={displayY}
        x2={width}
        y2={displayY}
        stroke={line.color}
        strokeWidth={isDragging ? 2 : 1.5}
        strokeDasharray={line.lineType === 'STOP_LOSS' ? '4 2' : '6 3'}
        pointerEvents="none"
      />
      <rect
        x={width - 90}
        y={displayY - 10}
        width={85}
        height={20}
        rx={3}
        fill={line.color}
        style={{ cursor: 'ns-resize' }}
        onMouseDown={handleMouseDown}
      />
      <text
        x={width - 48}
        y={displayY + 4}
        fill="#FFFFFF"
        fontSize={11}
        fontFamily="sans-serif"
        textAnchor="middle"
        pointerEvents="none"
      >
        {label}
      </text>
    </g>
  );
};

export const OrderLinesOverlay: React.FC<OrderLinesOverlayProps> = ({
  orders,
  converter,
  width = 800,
  height = 500,
  tickSize,
  minPriceLimit,
  maxPriceLimit,
  onCommitPrice,
  className,
}) => {
  const lines = computeOrderLines(orders, converter, width);

  return (
    <svg
      className={className}
      width={width}
      height={height}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        pointerEvents: 'auto',
        overflow: 'visible',
      }}
    >
      {lines.map((line) => (
        <InteractiveLine
          key={`${line.orderId}-${line.lineType}`}
          line={line}
          converter={converter}
          width={width}
          tickSize={tickSize}
          minPriceLimit={minPriceLimit}
          maxPriceLimit={maxPriceLimit}
          onCommitPrice={onCommitPrice}
        />
      ))}
    </svg>
  );
};

export default OrderLinesOverlay;