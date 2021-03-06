import {Entity, PrimaryGeneratedColumn, Column,ManyToMany,JoinTable,UpdateDateColumn, CreateDateColumn, ManyToOne, OneToMany} from "typeorm";
import { Channel } from "./Channel";
import { User } from "./User";
import { Watch } from "./Watch";
@Entity()
export class Video{
    @PrimaryGeneratedColumn()id: number;
    @Column()ytid: string;
    @Column({nullable: true})seconds: number;
    @Column({nullable: true})internalclicks: number;
    @Column({type: "text"})cache: string;
    @Column({nullable: true})guesseddate: Date;
    @UpdateDateColumn()lastloaded: Date;
    @CreateDateColumn()created: Date;
    @OneToMany(type => Watch, watch => watch.id)
    watches: Watch[];

    @ManyToOne(type => Channel, channel => channel.id)
    channel:Channel
}