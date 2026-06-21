import { Injectable } from '@angular/core';
import { Chart, ChartConfiguration, registerables } from 'chart.js';
import { CHART_COLORS } from 'src/app/constant/constants';
import { ChartType, PeriodCount } from 'src/app/models/summaryReport/summaryReportModel';


Chart.register(...registerables);

@Injectable({
  providedIn: 'root'
})
export class ChartService {

  private activeChart: Chart | null = null;

  createChart(
    canvas: HTMLCanvasElement,
    chartType: ChartType,
    currentOrSeries: PeriodCount[] | Array<{ year: number, label: string, periods: PeriodCount[] }>,
    labelsOrPrevious?: string[] | PeriodCount[],
    title?: string,
    digitInfo?: string
  ): Chart {
    this.destroyChart();

    // Detect multi-year series format: array of { year, label, periods }
    let labels: string[] = [];
    let datasets: any[] = [];
    const isMultiYear = Array.isArray(currentOrSeries) && currentOrSeries.length > 0 && (currentOrSeries as any)[0].periods !== undefined;

    if (isMultiYear) {
      const series = currentOrSeries as Array<{ year: number, label: string, periods: PeriodCount[] }>;
      // labels can be supplied explicitly (labelsOrPrevious) or inferred from first series or union
      if (Array.isArray(labelsOrPrevious) && typeof (labelsOrPrevious[0]) === 'string') {
        labels = labelsOrPrevious as string[];
      } else if (series.length > 0) {
        labels = series[0].periods.map(p => p.period);
      }
      // If labels are still empty, build union of all periods
      if (!labels || labels.length === 0) {
        const set = new Set<string>();
        for (const s of series) for (const p of s.periods || []) set.add(p.period);
        labels = Array.from(set);
      }

      // build datasets aligned to labels
      datasets = series.map((s, idx) => {
        const map = new Map<string, number>();
        for (const p of s.periods || []) map.set(p.period, p.count || 0);
        const dataArr = labels.map(l => map.get(l) || 0);
        return {
          label: s.label || String(s.year),
          data: dataArr,
          backgroundColor: (chartType === 'pie' || chartType === 'doughnut')
            ? labels.map((_, i) => CHART_COLORS[i % CHART_COLORS.length])
            : CHART_COLORS[idx % CHART_COLORS.length],
          borderColor: CHART_COLORS[idx % CHART_COLORS.length],
          borderWidth: 1,
          fill: chartType === 'area' ? true : undefined,
          tension: chartType === 'area' ? 0.4 : (chartType === 'line' ? 0.1 : undefined)
        };
      });

    } else {
      // legacy path: currentOrSeries is currentYear array, labelsOrPrevious is previousYear array
      const currentYear = currentOrSeries as PeriodCount[];
      const previousYear = (labelsOrPrevious as PeriodCount[]) || [];
      labels = currentYear.map(d => d.period);
      const currentData = currentYear.map(d => d.count);
      const previousData = previousYear.map(d => d.count);

      const labelCount = labels.length;

      const isPieType = chartType === 'pie' || chartType === 'doughnut';
      const isScatter = chartType === 'scatter';
      const isBubble = chartType === 'bubble';
      const isArea = chartType === 'area';
      const hasPreviousYear = previousData.length > 0;

      const mapChartType = (t: ChartType): keyof import('chart.js').ChartTypeRegistry => {
        if (t === 'area') return 'line';
        return t as unknown as keyof import('chart.js').ChartTypeRegistry;
      };
      const jsType = mapChartType(chartType);

      if (isScatter || isBubble) {
        const currentPoints = currentYear.map((d, i) => ({ x: i, y: d.count, ...(isBubble ? { r: Math.max(4, Math.sqrt(d.count) * 2) } : {}) }));
        datasets.push({
          label: 'Current Year',
          data: currentPoints,
          backgroundColor: CHART_COLORS[0],
          borderColor: CHART_COLORS[0],
          borderWidth: 1,
          pointRadius: isScatter ? 4 : undefined
        });

        if (hasPreviousYear) {
          const prevPoints = previousYear.map((d, i) => ({ x: i, y: d.count, ...(isBubble ? { r: Math.max(4, Math.sqrt(d.count) * 2) } : {}) }));
          datasets.push({
            label: 'Previous Year',
            data: prevPoints,
            backgroundColor: CHART_COLORS[3],
            borderColor: CHART_COLORS[3],
            borderWidth: 1
          });
        }
      } else {
        datasets = [{
          label: 'Current Year',
          data: currentData,
          backgroundColor: isPieType
            ? labels.map((_, i) => CHART_COLORS[i % CHART_COLORS.length])
            : CHART_COLORS[0],
          borderColor: isPieType ? '#ffffff' : CHART_COLORS[0],
          borderWidth: isPieType ? 2 : 1,
          fill: chartType === 'area' ? true : (chartType === 'line' ? false : undefined),
          tension: chartType === 'area' ? 0.4 : (chartType === 'line' ? 0.1 : undefined)
        }];

        if (hasPreviousYear && !isPieType) {
          datasets.push({
            label: 'Previous Year',
            data: previousData,
            backgroundColor: CHART_COLORS[3],
            borderColor: CHART_COLORS[3],
            borderWidth: 1,
            fill: chartType === 'area' ? true : (chartType === 'line' ? false : undefined),
            tension: chartType === 'area' ? 0.4 : (chartType === 'line' ? 0.1 : undefined)
          });
        }
      }

      // proceed to formatting and options below using labels and datasets
      // derive decimal places from Angular digitInfo (format 'minInt.minFrac-maxFrac')
      let decimals = 2;
      if (digitInfo) {
        const parts = String(digitInfo).split('-');
        const max = parts.length > 1 ? parseInt(parts[1], 10) : NaN;
        if (!isNaN(max)) decimals = max;
      }

      const formatNumber = (v: number | string) => {
        const n = Number(v) || 0;
        return n.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
      };

      const formatAxisIntegerTick = (value: any) => {
        const n = Number(value);
        return Number.isInteger(n) ? n.toString() : '';
      };

      const configLegacy: ChartConfiguration<keyof import('chart.js').ChartTypeRegistry, any, any> = {
        type: jsType,
        data: { labels, datasets },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: true, position: 'bottom' },
            title: { display: true, text: title || '', font: { size: 16, weight: 'bold' }, color: '#2c3e50' }
          },
          scales: isPieType ? {} : (isScatter || isBubble ? {
            x: {
              type: 'linear',
              min: 0,
              max: Math.max(0, labelCount - 1),
              ticks: {
                stepSize: 1,
                callback: function(value: any) {
                  const idx = Number(value);
                  return labels[idx] !== undefined ? labels[idx] : '';
                }
              },
              title: { display: true, text: 'Period' },
              grid: { display: false }
            },
            y: {
              beginAtZero: true,
              grid: { color: 'rgba(0,0,0,0.05)' },
              title: { display: true, text: 'Count' },
              ticks: {
                stepSize: 1,
                precision: 0,
                callback: function(value: any) {
                  return formatAxisIntegerTick(value);
                }
              }
            }
          } : {
            y: {
              beginAtZero: true,
              grid: { color: 'rgba(0,0,0,0.05)' },
              title: { display: true, text: 'Count' },
              ticks: {
                stepSize: 1,
                precision: 0,
                callback: function(value: any) {
                  return formatAxisIntegerTick(value);
                }
              }
            },
            x: { grid: { display: false }, title: { display: true, text: 'Period' } }
          })
        }
      };

      // tooltip label formatter to respect digitInfo
      (configLegacy.options!.plugins as any) = (configLegacy.options!.plugins as any) || {};
      (configLegacy.options!.plugins as any).tooltip = (configLegacy.options!.plugins as any).tooltip || {};
      (configLegacy.options!.plugins as any).tooltip.callbacks = (configLegacy.options!.plugins as any).tooltip.callbacks || {};
      (configLegacy.options!.plugins as any).tooltip.callbacks.label = function(context: any) {
        const v = context.raw && (typeof context.raw === 'number' ? context.raw : (context.raw.y ?? context.raw));
        return `${context.dataset.label || ''}: ${formatNumber(v)}`;
      };

      this.activeChart = new Chart(canvas, configLegacy);
      return this.activeChart;
    }
    // If we created datasets in the multi-year branch above, proceed to construct config below
    if (isMultiYear) {
      // derive decimal places from Angular digitInfo (format 'minInt.minFrac-maxFrac')
      let decimals = 2;
      if (digitInfo) {
        const parts = String(digitInfo).split('-');
        const max = parts.length > 1 ? parseInt(parts[1], 10) : NaN;
        if (!isNaN(max)) decimals = max;
      }

      const formatNumber = (v: number | string) => {
        const n = Number(v) || 0;
        return n.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
      };

      const formatAxisIntegerTick = (value: any) => {
        const n = Number(value);
        return Number.isInteger(n) ? n.toString() : '';
      };

      const isPieType = chartType === 'pie' || chartType === 'doughnut';
      const isScatter = chartType === 'scatter';
      const isBubble = chartType === 'bubble';
      const isArea = chartType === 'area';

      const mapChartType = (t: ChartType): keyof import('chart.js').ChartTypeRegistry => {
        if (t === 'area') return 'line';
        return t as unknown as keyof import('chart.js').ChartTypeRegistry;
      };
      const jsType = mapChartType(chartType);

      const config: ChartConfiguration<keyof import('chart.js').ChartTypeRegistry, any, any> = {
        type: jsType,
        data: { labels, datasets },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: true, position: 'bottom' },
            title: { display: true, text: title || '', font: { size: 16, weight: 'bold' }, color: '#2c3e50' }
          },
          scales: isPieType ? {} : {
            y: {
              beginAtZero: true,
              grid: { color: 'rgba(0,0,0,0.05)' },
              title: { display: true, text: 'Count' },
              ticks: {
                stepSize: 1,
                precision: 0,
                callback: function(value: any) {
                  return formatAxisIntegerTick(value);
                }
              }
            },
            x: { grid: { display: false }, title: { display: true, text: 'Period' } }
          }
        }
      };

      // tooltip label formatter to respect digitInfo
      (config.options!.plugins as any) = (config.options!.plugins as any) || {};
      (config.options!.plugins as any).tooltip = (config.options!.plugins as any).tooltip || {};
      (config.options!.plugins as any).tooltip.callbacks = (config.options!.plugins as any).tooltip.callbacks || {};
      (config.options!.plugins as any).tooltip.callbacks.label = function(context: any) {
        const v = context.raw && (typeof context.raw === 'number' ? context.raw : (context.raw.y ?? context.raw));
        return `${context.dataset.label || ''}: ${formatNumber(v)}`;
      };

      this.activeChart = new Chart(canvas, config);
      return this.activeChart;
    }
    // fallback return to satisfy type system
    return this.activeChart as Chart;
  }

  destroyChart(): void {
    if (this.activeChart) {
      this.activeChart.destroy();
      this.activeChart = null;
    }
  }
}
