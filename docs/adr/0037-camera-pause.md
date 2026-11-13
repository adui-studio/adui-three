# ADR-0037 相机过渡独立暂停

- 状态：Accepted
- 日期：2026-11-13
- 关联需求：FR-049、FR-020、FR-040、FR-047
- 替代关系：扩展 ADR-0008/0028/0035 的运行状态，不改变宿主时钟

## 决策

CameraTransitionState 增加 paused；CameraTransitionHandle 与 CameraViewTransitionHandle 增加 pause()/resume()。透视/正交的对象取景和书签恢复共用内部暂停控制器，只冻结该运动的 elapsed/progress 与姿态/镜头写入，不停止宿主，不消耗暂停期间的 delta，继续时处理剩余时长，不补墙钟时间。

暂停保留相机运动登记、输入监听与 enabled/damping/autoRotate 租约。输入、signal、scope、替换或即时应用仍可结束 paused 句柄；宿主继续更新时仍验证可观察尺寸/姿态/投影/控件变化，发现外部修改则取消，保留消费者值。宿主本身停止/隐藏/零尺寸时不轮询。finished 在暂停时不结算，完成/取消/失败后 pause/resume 幂等无操作。

## 原生回调与初始化

内部结算状态与暂停门控分离，避免将 paused 误认为终态而跳过清理。初始化及每次写入持有暂停请求延迟区间；原生回调中的 pause/resume 按调用先后覆盖请求，等完整当前姿态提交、写锁释放后生效，不中断半帧写入或留下过期姿态基线。

终点完成或异常优先结算；在终点回调请求暂停不会把 completed 改为 paused。初始化中的请求仍安装有效更新订阅，准备失败仍释放写锁与租约。没有新 RAF、计时器、GPU 目标或独立相机控制器实例，默认核心不依赖此模块。

## 验证

四种运动单测覆盖独立冻结/继续、时长与未结算 Promise、暂停租约、输入/取消/销毁/替换/外部修改、初始请求、原生回调顺序、终点和异常。投影演示提供“暂停相机 / 继续相机”，与宿主暂停按钮分开。浏览器挂接原生 drawElements 计数并读取像素，验证暂停时同一宿主仍真实绘制、当前像素保持、对侧独立、继续到达终点与暂停输入取消。包消费验证两种句柄；实际结果见 Harness。

## 来源

- [相机过渡](0008-camera-transition.md)
- [正交过渡](0028-orthographic-transition.md)
- [保存视角平滑恢复](0035-camera-view-transition.md)
- [OrbitControls 官方文档](https://threejs.org/docs/pages/OrbitControls.html)
