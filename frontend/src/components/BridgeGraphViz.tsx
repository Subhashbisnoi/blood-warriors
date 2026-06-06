import { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import type { ActiveBridge } from '../types';

interface Props {
  bridge: ActiveBridge;
}

const C = {
  bloodgroup:     '#ba1a1a',
  bridge_node:    '#e57373',
  donor_active:   '#1565c0',
  donor_inactive: '#bdbdbd',
  edge_compat:    '#ba1a1a',
  edge_member:    '#42a5f5',
  edge_distance:  '#80cbc4',
};

interface GNode {
  id: string;
  type: 'bloodgroup' | 'bridge' | 'donor';
  active?: boolean;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;
}

interface GLink {
  source: GNode;
  target: GNode;
  ltype: string;
}

export default function BridgeGraphViz({ bridge }: Props) {
  const ref = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const W = 280;
    const H = 130;

    d3.select(el).selectAll('*').remove();
    const svg = d3.select(el);

    const uid = bridge.bridge_id.replace(/[^a-z0-9]/gi, '').slice(0, 8);

    // Glow filters
    const defs = svg.append('defs');
    [['red', '#ba1a1a'], ['blue', '#1565c0']].forEach(([name, col]) => {
      const f = defs.append('filter')
        .attr('id', `mg-${name}-${uid}`)
        .attr('x', '-60%').attr('y', '-60%').attr('width', '220%').attr('height', '220%');
      f.append('feGaussianBlur').attr('in', 'SourceGraphic').attr('stdDeviation', '3').attr('result', 'blur');
      f.append('feMerge').call((m: d3.Selection<SVGFEMergeElement, unknown, null, undefined>) => {
        m.append('feMergeNode').attr('in', 'blur');
        m.append('feMergeNode').attr('in', 'SourceGraphic');
      });
      void col;
    });

    // Build graph data
    const donorSlots = Math.min(Math.max((bridge.donor_count ?? 0) + 2, 5), 10);
    const rawNodes: GNode[] = [
      { id: 'bg',  type: 'bloodgroup', x: W / 2, y: H / 2 },
      { id: 'br0', type: 'bridge' },
      { id: 'br1', type: 'bridge' },
      { id: 'br2', type: 'bridge' },
    ];
    for (let i = 0; i < donorSlots; i++) {
      rawNodes.push({ id: `d${i}`, type: 'donor', active: i < (bridge.donor_count ?? 0) });
    }

    const nodeById = new Map<string, GNode>(rawNodes.map(n => [n.id, n]));

    const rawLinks: { sid: string; tid: string; ltype: string }[] = [
      { sid: 'bg', tid: 'br0', ltype: 'COMPATIBLE_WITH' },
      { sid: 'bg', tid: 'br1', ltype: 'COMPATIBLE_WITH' },
      { sid: 'bg', tid: 'br2', ltype: 'COMPATIBLE_WITH' },
    ];
    rawNodes.filter(n => n.type === 'donor').forEach((n, i) => {
      rawLinks.push({ sid: n.id, tid: 'bg', ltype: 'MEMBER_OF' });
      if (i < 4) rawLinks.push({ sid: n.id, tid: `br${i % 3}`, ltype: 'DISTANCE_TO' });
    });

    const links: GLink[] = rawLinks
      .map(l => ({ source: nodeById.get(l.sid)!, target: nodeById.get(l.tid)!, ltype: l.ltype }))
      .filter(l => l.source && l.target);

    const sim = d3.forceSimulation<GNode>(rawNodes)
      .force('link', d3.forceLink<GNode, GLink>(links)
        .id(n => n.id)
        .distance(l => l.ltype === 'COMPATIBLE_WITH' ? 58 : 42)
        .strength(l => l.ltype === 'MEMBER_OF' ? 0.25 : 0.55))
      .force('charge', d3.forceManyBody<GNode>().strength(n => n.type === 'bloodgroup' ? -200 : -45))
      .force('center', d3.forceCenter(W / 2, H / 2))
      .force('collision', d3.forceCollide<GNode>(n => n.type === 'bloodgroup' ? 17 : n.type === 'bridge' ? 10 : 6))
      .alphaDecay(0.045);

    const g = svg.append('g');

    const linkSel = g.append('g')
      .selectAll<SVGLineElement, GLink>('line')
      .data(links)
      .join('line')
      .attr('stroke', (d: GLink) =>
        d.ltype === 'COMPATIBLE_WITH' ? C.edge_compat
        : d.ltype === 'MEMBER_OF' ? C.edge_member
        : C.edge_distance)
      .attr('stroke-width', (d: GLink) => d.ltype === 'COMPATIBLE_WITH' ? 1.5 : 0.8)
      .attr('stroke-opacity', (d: GLink) => d.ltype === 'COMPATIBLE_WITH' ? 0.55 : 0.22);

    const nodeSel = g.append('g')
      .selectAll<SVGGElement, GNode>('g')
      .data(rawNodes)
      .join('g');

    // Pulse ring
    nodeSel.filter((n: GNode) => n.type === 'bloodgroup')
      .append('circle')
      .attr('r', 18)
      .attr('fill', 'none')
      .attr('stroke', '#ba1a1a')
      .attr('stroke-width', 1)
      .attr('stroke-opacity', 0.22);

    nodeSel.append('circle')
      .attr('r', (n: GNode) => n.type === 'bloodgroup' ? 13 : n.type === 'bridge' ? 7 : 4)
      .attr('fill', (n: GNode) => {
        if (n.type === 'bloodgroup') return C.bloodgroup;
        if (n.type === 'bridge')     return C.bridge_node;
        return n.active ? C.donor_active : C.donor_inactive;
      })
      .attr('stroke', (n: GNode) => n.type === 'bloodgroup' ? '#7b0000' : 'rgba(0,0,0,0.1)')
      .attr('stroke-width', (n: GNode) => n.type === 'bloodgroup' ? 2 : 0.5)
      .attr('filter', (n: GNode) => {
        if (n.type === 'bloodgroup')             return `url(#mg-red-${uid})`;
        if (n.type === 'donor' && n.active)      return `url(#mg-blue-${uid})`;
        return null;
      });

    const bgLabel = (bridge.patient_blood_group ?? '')
      .replace('Positive', '+').replace('Negative', '−')
      .replace('positive', '+').replace('negative', '−')
      .trim().slice(0, 5) || '?';

    nodeSel.filter((n: GNode) => n.type === 'bloodgroup')
      .append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '0.35em')
      .attr('font-size', '7px')
      .attr('font-weight', '800')
      .attr('fill', '#fff')
      .attr('pointer-events', 'none')
      .text(bgLabel);

    const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

    sim.on('tick', () => {
      linkSel
        .attr('x1', (d: GLink) => clamp(d.source.x ?? W / 2, 5, W - 5))
        .attr('y1', (d: GLink) => clamp(d.source.y ?? H / 2, 5, H - 5))
        .attr('x2', (d: GLink) => clamp(d.target.x ?? W / 2, 5, W - 5))
        .attr('y2', (d: GLink) => clamp(d.target.y ?? H / 2, 5, H - 5));
      nodeSel.attr('transform', (n: GNode) =>
        `translate(${clamp(n.x ?? W / 2, 8, W - 8)},${clamp(n.y ?? H / 2, 8, H - 8)})`);
    });

    return () => { sim.stop(); };
  }, [bridge]);

  return (
    <svg
      ref={ref}
      className="w-full"
      style={{ height: 130, display: 'block' }}
      viewBox="0 0 280 130"
      preserveAspectRatio="xMidYMid meet"
    />
  );
}
