// 禁止 windows 下 debug 时出现 CMD 窗口
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    xiyu_shengtu_lib::run()
}
