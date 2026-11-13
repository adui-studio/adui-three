# ADR-0034 路径有限循环

- 状态：Accepted
- 日期：2026-11-13
- 关联需求：FR-046、FR-036、FR-045
- 替代关系：扩展 ADR-0024 的循环结束策略和 ADR-0033 的定位计数重置

## 决策

FollowPathOptions.repetitions 是可选正安全整数或 Infinity。单向一程计数，duration 为每程宿主秒数，一次往返为两程。once 默认且仅 1，repeat/pingpong 默认 Infinity。参数在采样、替换旧运动和目标写入前验证；非法次数 RangeError，保留已有运动。

| 模式     | 有限次数 | 最后位置与朝向                   |
| -------- | -------- | -------------------------------- |
| once     | 1        | 进度 1，正向切线                 |
| repeat   | 任意     | 进度 1，正向切线，不在完成帧回绕 |
| pingpong | 奇数     | 进度 1，正向切线                 |
| pingpong | 偶数     | 进度 0，返回方向的切线           |

朝向仅在 orientToPath=true 时写入。完成保留到达姿态，finished 始终 resolve，解除更新/资源/事件登记，不释放借用目标或资源。暂停不消费预算，宿主隐藏/停止不补墙钟时间；没有新计时器或循环。progress 仍是当前曲线的局部比例。

## 数值与竞争

每次 delta/duration 分离整数程数和小数，再合并有界局部进度。剩余预算为安全整数或 Infinity，不逐程迭代、不累积无限 elapsed，避免将原有 0.75 与大整数直接相加后丢失小数。不能表示有限步长时保持原 RangeError/failed 策略；不承诺超越 JavaScript Number 的精度。

候选位置/朝向成功应用后才提交 phase、progress 和预算。最后采样中的取消、暂停、目标或所有者变化仍按原生命周期规则处理，未应用的候选不触发完成；异常和清理失败保留既有 finished/failed 契约。

## 定位与继续

seek 重置首个正向阶段及 repetitions 历史。seek(0.5) 是首程中点；seek(1) 仍暂停预览，首程终点的完成/回绕/换向在 resume 后的更新处理。一次时可在零 delta 更新完成，多次时继续剩余程数。结束句柄不能重新定位，创建新 followPath。

## 验证

单测覆盖有限 repeat、往返 1/2/3/4 程终点/朝向、暂停、定位预算重置、端点继续、非法/预取消请求、最后采样取消及 MAX_SAFE_INTEGER 预算下的小数保留。演示提供循环两次和往返一次，每程 2 秒；浏览器核验完成姿态、另一目标继续、完成后拾取。独立 tarball 验证选项类型；完整验证结果见 Harness。

## 来源

- [Curve 官方文档](https://threejs.org/docs/pages/Curve.html)
- [路径生命周期](0024-path-motion.md)
- [路径定位](0033-path-seek.md)
