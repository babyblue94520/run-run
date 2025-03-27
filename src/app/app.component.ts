import {
  CdkVirtualScrollViewport,
  ScrollingModule,
} from '@angular/cdk/scrolling';
import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  Component,
  QueryList,
  ViewChildren,
} from '@angular/core';
import { FormControl, FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatTabsModule } from '@angular/material/tabs';
import Chart from 'chart.js/auto';
import ChartDataLabels from 'chartjs-plugin-datalabels';
import { Delay } from '../ts/delay';

interface Range {
  start: number;
  end: number;
}

interface Result {
  id: string;
  combination: SkillTimeRange[];
  timeRanges: Range[];
  totalTime: number;
  effects?: Range[];
  chart?: Chart;
}

interface Form {
  combination: string;
}

interface SkillTimeRange {
  cd: number;
  startTime: number;
  times: Range[];
}

@Component({
  selector: 'app-root',
  imports: [
    CommonModule,
    FormsModule,
    MatInputModule,
    MatIconModule,
    MatExpansionModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatTabsModule,
    ScrollingModule,
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent implements AfterViewInit {
  unit = 5;
  cd = 30;
  minCD = 0;
  maxCD = 35;
  keep = 5;
  startTime = 4.8;
  startTimes = [4.8, 5];
  endTime = 101;
  stepCount = 8;

  stations = [
    { start: 19, end: 34 },
    { start: 61, end: 76 },
  ];

  selected = new FormControl(0);

  form: Form = { combination: '' };

  result: Result[] = [];

  cds: number[] = [];
  skillTimeRanges: SkillTimeRange[] = [];
  combinations: Result[] = [];

  @ViewChildren(CdkVirtualScrollViewport)
  private viewports: QueryList<CdkVirtualScrollViewport>;

  constructor() {
    this.cds = [];

    for (let i = this.minCD; i <= this.maxCD; i += this.unit) {
      this.cds.push(i);
    }

    this.init();
  }

  public ngAfterViewInit(): void {}

  public clear() {
    this.form.combination = '';
    this.result = [];
  }

  public enter() {
    this.doSearch();
  }

  public stationChange() {
    for (let station of this.stations) {
      station.end = station.start + 15;
    }
    this.reinit();
  }

  animationDone() {
    this.viewports.forEach((viewport) => viewport.checkViewportSize());
  }

  public search() {
    this.doSearch();
    this.selected.setValue(1);
  }

  @Delay(1000)
  public reinit() {
    this.init();
  }

  private doSearch() {
    let combination = this.getNumberCombination();
    this.form.combination = combination.join(' ');

    let array = (this.result = []);
    if (combination.length == 0) return;
    let entries = Object.entries(combination);
    for (let record of this.combinations) {
      let count = 0;
      let matchSource = [];
      for (let c of record.combination) {
        matchSource.push(c.cd);
      }

      for (const [key, value] of entries) {
        for (let i in matchSource) {
          if (value == matchSource[i]) {
            count++;
            matchSource[i] = undefined;
            break;
          }
        }
      }
      if (count == entries.length) {
        array.push(record);
      }
    }
  }

  /**
   * 取得數字組合陣列
   */
  public getNumberCombination() {
    let ss = this.form.combination.split(/\s+/);
    let combination: number[] = [];
    for (let v of ss) {
      if (v == '' || isNaN(<any>v)) continue;
      combination.push(Number(v));
    }
    combination.sort();
    return combination;
  }

  private init() {
    this.result = [];

    let array = (this.skillTimeRanges = []);

    // for (let startTime of this.startTimes) {
    let startTime = this.startTime;
    for (let r of this.cds) {
      let data: SkillTimeRange = { cd: r, startTime: startTime, times: [] };
      array.push(data);
      let rcd = (this.cd * (100 - r)) / 100;
      rcd = Math.round(rcd * 100) / 100;
      let t = startTime;
      while (t < this.endTime) {
        data.times.push({
          start: t,
          end: Math.min(t + this.keep, this.endTime),
        });
        t += rcd;
      }
      // }
    }
    array.sort((a, b) => (a.cd > b.cd ? 1 : a.cd == b.cd ? 0 : -1));

    let combinations = this.calculateCombinations<SkillTimeRange>(
      this.skillTimeRanges,
      5
    );
    this.combinations = this.calculateTimes(combinations);
  }

  /**
   * 初始化 Chart
   */
  initChart(chart: HTMLDivElement, record: Result) {
    if (!chart.querySelector('canvas')) {
      let canvas = document.createElement('canvas');
      chart.appendChild(canvas);
      let data = this.toChartData(record);
      new Chart<'bar'>(canvas, {
        type: 'bar',
        data: data,
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          aspectRatio: 7,
          scales: {
            x: {
              // stacked: true,
              ticks: {
                minRotation: 0,
                maxRotation: this.endTime + 5,
                stepSize: 5,
                callback: this.toTime,
              },
            },
            y: {
              stacked: true,
              ticks: {
                autoSkip: false,
              },
            },
          },
          plugins: {
            legend: {
              display: false,
            },
            datalabels: {
              color: 'black', // 設置數據標籤的顏色
              align: 'top', // 設置數據標籤的位置（上方）
              font: {
                weight: 'bold', // 設置字體加粗
              },
              formatter: (value) => {
                if (value[1] == 0) return '';
                return `${this.toTime(value[0])} - ${this.toTime(value[1])}`;
              },
            },
          },
        },
        plugins: [ChartDataLabels],
      });
    }
    return record.id;
  }

  /**
   * 轉換為 Chart Data
   */
  toChartData(record: Result) {
    let labels = [`站點時間`];
    let datasets: any[] = [];

    for (let i = 0; i < this.stepCount; i++) {
      let t = this.stations[i];
      let data = [t ? [t.start, t.end] : [0, 0]];
      datasets.push({
        label: '',
        data: data,
        backgroundColor: [
          'rgba(165, 182, 200, 0.6)',
          'rgba(0, 255, 72, 0.6)',
          'rgba(0, 123, 255, 0.6)',
          'rgba(0, 123, 255, 0.6)',
          'rgba(0, 123, 255, 0.6)',
          'rgba(0, 123, 255, 0.6)',
          'rgba(0, 123, 255, 0.6)',
        ],
        borderColor: [
          'rgba(165, 182, 200, 0.6)',
          'rgba(0, 255, 72, 0.6)',
          'rgba(0, 123, 255, 0.6)',
          'rgba(0, 123, 255, 0.6)',
          'rgba(0, 123, 255, 0.6)',
          'rgba(0, 123, 255, 0.6)',
          'rgba(0, 123, 255, 0.6)',
        ],
        borderWidth: 1,
        barPercentage: 0.5,
      });
    }

    labels.push(`有效時間`);
    for (let i = 0; i < this.stepCount; i++) {
      let dataset = datasets[i];
      let t = record.effects[i];
      if (t) {
        dataset.data.push([t.start, t.end]);
      } else {
        dataset.data.push([0, 0]);
      }
    }

    for (let v of record.combination) {
      labels.push(`${v.cd < 10 ? '  ' : ''}-${v.cd}%`);
      for (let i = 0; i < this.stepCount; i++) {
        let dataset = datasets[i];
        let t = v.times[i];
        if (t) {
          dataset.data.push([t.start, t.end]);
        } else {
          dataset.data.push([0, 0]);
        }
      }
    }

    return {
      labels: labels,
      datasets: datasets,
    };
  }

  /**
   * 計算所有組合的時間
   */
  public calculateTimes(combinations: SkillTimeRange[][]) {
    let result: Result[] = [];

    for (let combination of combinations) {
      let timeRanges = [];
      for (let cd of combination) {
        for (let range of cd.times) {
          let merge = false;
          for (let t of timeRanges) {
            if (range.start > t.end || range.end < t.start) continue;
            t.start = Math.min(range.start, t.start);
            t.end = Math.max(range.end, t.end);
            merge = true;
            break;
          }
          if (!merge) {
            timeRanges.push({ ...range });
          }
        }
      }
      timeRanges.sort((a, b) =>
        a.start > b.start ? 1 : a.start == b.start ? 0 : -1
      );
      let totalTime = 0;
      let effects = [];
      for (let range of timeRanges) {
        let start = range.start;
        let end = range.end;
        let second = end - start;
        let conflictStation = undefined;
        for (let station of this.stations) {
          if (station.start > end || station.end < start) continue;
          conflictStation = station;
          second -= Math.min(station.end, end) - Math.max(station.start, start);
        }
        totalTime += second;
        if (conflictStation) {
          if (conflictStation.end < range.end) {
            effects.push({ start: conflictStation.end, end: range.end });
          }
          if (conflictStation.start > range.start) {
            effects.push({ start: range.start, end: conflictStation.start });
          }
        } else {
          effects.push(range);
        }
      }

      totalTime = Math.round(totalTime * 100) / 100;
      let id = '';
      for (let a of combination) {
        // id += `${a.cd}(${a.startTime}) `;
        id += `${a.cd} `;
      }
      let d = {
        id: id,
        combination: [...combination],
        timeRanges: [...timeRanges],
        totalTime,
        effects,
      };
      result.push(d);
    }
    result.sort((a, b) =>
      a.totalTime > b.totalTime ? -1 : a.totalTime == b.totalTime ? 0 : 1
    );
    return result;
  }

  /**
   * 產稱所有排列組合
   * N 取 C 可重複
   */
  public calculateCombinations<T>(array: any[], count: number): T[][] {
    function combine(temp: any[], start: number) {
      if (temp.length === count) {
        result.push(JSON.parse(JSON.stringify(temp)));
        return;
      }
      for (let i = start; i < array.length; i++) {
        temp.push(array[i]);
        combine(temp, i); // 這裡讓 `i` 不變，允許元素重複
        temp.pop();
      }
    }

    let result: T[][] = [];
    combine([], 0);
    return result;
  }

  /**
   * 轉換成時間格式  MM:ss
   */
  public toTime(v) {
    v = Number(v);
    let m = Math.floor(v / 60);
    let s = (v * 100 - m * 60 * 100) / 100;
    if (m > 0) {
      if (s < 10) {
        return `${m}:0${s}`;
      } else {
        return `${m}:${s}`;
      }
    }
    return v;
  }
}
