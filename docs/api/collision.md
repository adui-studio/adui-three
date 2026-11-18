# 静态碰撞

## 静态碰撞世界

`createCollisionWorld(roots, { iterations?: number, skin?: number })` 使用 three-mesh-bvh 0.9.18，无全局原型修改。iterations 默认8、范围1..32整数；skin 默认1e-5、正有限。world 暴露 disposed、triangleCount、bounds 快照，resolveCapsule(Line3,radius)、raycast(Ray,maxDistance=Infinity)、dispose。胶囊返回独立 segment、correction、contacts（normal/point/depth）及 converged；射线返回独立 distance/point/normal 或 null。输入不修改，normal 朝向来向，胶囊半径正有限、射线距离非负。

构建烘焙普通 Mesh 的世界三角形位置，源几何体/材质借用，快照不随源变换变化。包括隐藏对象，忽略材质、groups/drawRange；不接受蒙皮、形变、实例、批次和退化变换。动态模型请在应用端用成熟工具先烘焙再重建世界。bounds 包含 BVH 数值 padding。dispose 释放自有快照与索引，后续查询拒绝；控制器不会自动销毁借用世界。

角色求解为有限子步的静态运动学表面控制，不是刚体引擎、完整连续碰撞、台阶攀爬或导航网格寻路；复杂深穿透可能不收敛。依据资产单位调整胶囊、skin、迭代和子步预算，不保证极端速度、任意网格角落或动态障碍。只有显式导入 collision 才加载实际 BVH 运行时代码。
