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
  stations?: Range[]; // 新增：動態站點時間
  dynamicEndTime?: number; // 新增：動態結束時間
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
  memberCount=4;
  unit = 5;
  cd = 30;
  minCD = 0;
  maxCD = 35;
  keep = 5;
  startTime = 4.8;
  startTimes = [4.8, 5];
  endTime = 110;
  stepCount = 0;
  
  baseSpeed = 1; // 基礎移動速度（單位/秒）
  stationStayDuration = 15; // 站點停留時間（秒）

  // 原始站點時間（基於無加速的情況）
  stations = [
    { start: 20, end: 0 },
    { start: 65, end: 0 },
    { start: 110, end: 0 }, // 第三站（原 EndTime）
  ];
  
  // 站點距離（基於原始到站時間計算）
  stationDistances: number[] = [];

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
    
    // 初始化站點距離（基於原始到站時間計算）
    // 注意：start 是時間軸上的時間，包含之前的站點停留時間
    // 因此計算距離時，需要扣除之前的停留時間
    this.stationDistances = this.stations.map((station, index) => {
      let movingTime = station.start - (index * this.stationStayDuration);
      return movingTime * this.baseSpeed;
    });

    this.init();
  }

  public ngAfterViewInit(): void { }

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
    this.stationDistances = this.stations.map((station, index) => {
      let movingTime = station.start - (index * this.stationStayDuration);
      return movingTime * this.baseSpeed;
    });

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
      this.memberCount
    );
    this.combinations = this.calculateTimesWithDynamicRate(combinations);
  }

  private calculateTimesWithDynamicRate(combinations: SkillTimeRange[][]) {
    let result: Result[] = [];

    for (let combination of combinations) {
      // 使用原始的技能時間（固定CD，不受加速影響）
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

      // 計算動態站點時間
      let dynamicStations: Range[] = [];
      let currentPos = 0;
      let currentTime = 0;
      let stationIdx = 0;
      const SPEED_BOOST = 1.1; // 10% 加速

      // 將時間軸切分為有加速和無加速的段落
      // timeRanges 已經是合併過的技能生效區間（有加速）
      
      // 我們需要一個事件隊列：技能開始、技能結束、站點到達（這個是動態的，不能預先加入）
      // 簡單點：模擬每一段 skill range
      
      let lastTime = 0;
      
      // 處理直到所有站點都到達，並且到達終點
      let dynamicEndTime = this.endTime;
      
      // 模擬移動直到所有站點都到達
      while (stationIdx < this.stationDistances.length) {
        let targetDist = this.stationDistances[stationIdx];
        let distNeeded = targetDist - currentPos;
        
        // 找當前時間點之後的第一個技能區間
        let activeRange = timeRanges.find(r => r.end > currentTime);
        
        let speed = 1;
        let timeToNextEvent = Infinity; // 下一個速度變化點
        
        if (activeRange && activeRange.start <= currentTime) {
          // 當前在技能區間內
          speed = SPEED_BOOST;
          timeToNextEvent = activeRange.end - currentTime;
        } else if (activeRange) {
          // 當前不在技能區間，但後面還有
          speed = 1;
          timeToNextEvent = activeRange.start - currentTime;
        } else {
          // 後面沒有技能了
          speed = 1;
          timeToNextEvent = Infinity;
        }
        
        // 計算以當前速度移動到下一個事件或到達站點需要的時間
        let timeToStation = distNeeded / speed;
        
        if (timeToStation <= timeToNextEvent) {
          // 在速度改變前到達站點
          currentTime += timeToStation;
          currentPos = targetDist; // 應該等於 this.stationDistances[stationIdx]
          
          let arrivalTime = Math.round(currentTime * 100) / 100;
          let departTime = 0;
          
          // 如果是最後一個站點（終點），不需要停留時間，或者根據需求處理
          // 邏輯上 third station 是原先的 endTime (110)，可能不需要 stayDuration??
          // 但原本 logic 是 endTime (110) 包含了停留時間。
          // 這裡我們假設最後一站也是一個普通站點，有到達和離開時間
          // 用戶需求：把 endTime 修改進 stations 作為第三戰
          
          departTime = Math.round((currentTime + this.stationStayDuration) * 100) / 100;
          
          dynamicStations.push({
            start: arrivalTime,
            end: departTime
          });
          
          // 在站點停留
          currentTime = departTime;
          stationIdx++;
        } else {
          // 在到達站點前速度發生變化（技能開始或結束）
          currentTime += timeToNextEvent;
          currentPos += timeToNextEvent * speed;
        }
      }
      
      // 動態結束時間就是最後一個站點的結束時間
      if (dynamicStations.length > 0) {
        dynamicEndTime = dynamicStations[dynamicStations.length - 1].end;
      }

      let totalTime = 0;
      let effects = [];
      for (let range of timeRanges) {
        // 如果技能開始時間已經超過動態結束時間，則不計入
        if (range.start >= dynamicEndTime) continue;

        let start = range.start;
        // 技能結束時間被 dynamicEndTime 截斷
        let end = Math.min(range.end, dynamicEndTime);
        
        let second = end - start;
        let conflictStation = undefined;
        // 使用動態計算的站點時間
        for (let station of dynamicStations) {
          if (station.start > end || station.end < start) continue;
          conflictStation = station;
          second -= Math.min(station.end, end) - Math.max(station.start, start);
        }
        totalTime += second;
        if (conflictStation) {
          if (conflictStation.end < end) {
            effects.push({ start: conflictStation.end, end: end });
          }
          if (conflictStation.start > start) {
            effects.push({ start: start, end: conflictStation.start });
          }
        } else {
          // 這裡也要確保不加入無效的 range
          if (start < end) {
             effects.push({start, end});
          }
        }
      }

      totalTime = Math.round(totalTime * 100) / 100;
      let id = '';
      for (let a of combination) {
        id += `${a.cd} `;
      }
      let d = {
        id: id,
        combination: [...combination],
        timeRanges: [...timeRanges],
        totalTime,
        effects,
        stations: dynamicStations, // 儲存動態站點時間
        dynamicEndTime: dynamicEndTime, // 儲存動態結束時間
      };
      
      let maxLen = Math.max(d.stations.length, d.timeRanges.length, d.effects.length);
      if (maxLen > this.stepCount) {
        this.stepCount = maxLen;
      }
      result.push(d);
    }
    
    result.sort((a, b) =>
      a.totalTime > b.totalTime ? -1 : a.totalTime == b.totalTime ? 0 : 1
    );
    return result;
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
      let t = record.stations ? record.stations[i] : this.stations[i];
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
      if (d.timeRanges.length > this.stepCount) {
        this.stepCount = d.timeRanges.length;
      }
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
