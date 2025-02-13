import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormControl, FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatTabsModule } from '@angular/material/tabs';
import Chart from 'chart.js/auto';
import ChartDataLabels from 'chartjs-plugin-datalabels';

interface Range {
  start: number;
  end: number;
}

interface Result {
  id: string;
  combination: SkillTimeRange[];
  timeRanges: Range[];
  totalTime: number;
  chart?: Chart;
}

interface Form {
  combination: string;
}

interface SkillTimeRange {
  cd: number;
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
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent {
  selected = new FormControl(0);

  form: Form = { combination: '' };

  result: Result[] = [];

  cds: number[] = [];
  skillTimeRanges: SkillTimeRange[] = [];
  combinations: Result[] = [];
  map = new Map();

  unit = 5;
  cd = 30;
  minCD = 0;
  maxCD = 35;
  keep = 5;
  startTime = 5;
  endTime = 102;

  stations = [
    { start: 19, end: 34 },
    { start: 61, end: 76 },
  ];

  constructor() {
    this.initCD();
  }

  public search() {
    var ss = this.form.combination.split(' ');
    var combination: number[] = [];
    for (var v of ss) {
      combination.push(Number(v));
    }
    combination.sort();
    this.result = [];
    var entries = Object.entries(combination);
    for (var record of this.combinations) {
      var count = 0;
      for (const [key, value] of entries) {
        for(let c of record.combination){
          if (value == c.cd) {
            count++;
            break;
          }
        }
      }
      if (count == entries.length) {
        this.result.push(record);
      }
    }
    this.selected.setValue(1);
  }

  initCD() {
    this.cds = [];

    for (var i = this.minCD; i <= this.maxCD; i += this.unit) {
      this.cds.push(i);
    }

    this.skillTimeRanges = [];
    for (var r of this.cds) {
      var data: SkillTimeRange = { cd: r, times: [] };
      this.skillTimeRanges.push(data);
      var rcd = (this.cd * (100 - r)) / 100;
      var t = this.startTime;
      while (t < this.endTime) {
        data.times.push({ start: t, end: t + this.unit });
        t += rcd;
      }
    }

    var combinations = this.getCombinationsWithRepetition<SkillTimeRange>(
      this.skillTimeRanges,
      5
    );

    this.combinations = this.calculateTimes(combinations);
  }

  public getDescription(data: Result) {
    var result = '';
    for (var a of data.combination) {
      result += a.cd + ', ';
    }
    return result;
  }

  public getContent(result: Result) {
    return JSON.stringify(result);
  }

  initChart(canvas: any, record: Result) {
    if (!record.chart) {
      var data = this.toChartData(record);
      record.chart = new Chart<'bar'>(canvas, {
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
                maxRotation: this.endTime,
                stepSize: 2,
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

  toChartData(record: Result) {
    var labels = [`站點時間`];
    var datasets: any[] = [];

    for (var i = 0; i < 7; i++) {
      var t = this.stations[i];
      var data = [t ? [t.start, t.end] : [0, 0]];
      datasets.push({
        label: `第 ${i + 1} 次`,
        data: data,
        backgroundColor: [
          'rgba(165, 182, 200, 0.6)',
          'rgba(0, 123, 255, 0.6)',
          'rgba(0, 123, 255, 0.6)',
          'rgba(0, 123, 255, 0.6)',
          'rgba(0, 123, 255, 0.6)',
          'rgba(0, 123, 255, 0.6)',
        ],
        borderColor: [
          'rgba(165, 182, 200, 0.6)',
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

    for (var v of record.combination) {
      labels.push(`寵物冷卻 ${v.cd < 10 ? '  ' : ''}-${v.cd}%`);
      for (var i = 0; i < 7; i++) {
        var dataset = datasets[i];
        var t = v.times[i];
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

  public calculateTimes(combinations: SkillTimeRange[][]) {
    var result: Result[] = [];

    for (var combination of combinations) {
      var timeRanges = [];
      for (let cd of combination) {
        for (let range of cd.times) {
          var merge = false;
          for (var t of timeRanges) {
            if (range.start > t.end || range.end < t.start) continue;
            if (range.start < t.start) {
              t.start = range.start;
            }
            if (range.end > t.end) {
              t.end = range.end;
            }
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
      var totalTime = 0;
      for (let range of timeRanges) {
        var start = range.start;
        var end = range.end;
        var second = end - start;
        for (let station of this.stations) {
          if (station.start > end || station.end < start) continue;
          second -= Math.min(station.end, end) - Math.max(station.start, start);
        }

        totalTime += second;
      }

      var id = '';
      for (var a of combination) {
        id += a.cd + ', ';
      }
      var d = {
        id: id,
        combination: [...combination],
        timeRanges: [...timeRanges],
        totalTime,
      };
      result.push(d);
    }
    result.sort((a, b) =>
      a.totalTime > b.totalTime ? -1 : a.totalTime == b.totalTime ? 0 : 1
    );
    return result;
  }

  public getCombinationsWithRepetition<T>(array: any[], count: number): T[][] {
    function combine(temp: any[], start: number) {
      if (temp.length === count) {
        result.push([...temp]);
        return;
      }
      for (let i = start; i < array.length; i++) {
        temp.push(array[i]);
        combine(temp, i); // 這裡讓 `i` 不變，允許元素重複
        temp.pop();
      }
    }

    var result: T[][] = [];
    combine([], 0);
    return result;
  }

  private toTime(v) {
    v = Number(v);
    var m = Math.floor(v / 60);
    var s = v % 60;
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
